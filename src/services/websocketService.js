const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');

// Store connected clients
const deviceSockets = new Map();
const userSockets = new Map();

const setupWebSocket = (io) => {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      // Check if it's a device token or user token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.type === 'device') {
        socket.isDevice = true;
        socket.deviceId = decoded.deviceId;
        
        // Verify device exists
        const device = await Device.findOne({ deviceId: socket.deviceId });
        if (!device) {
          return next(new Error('Device not found'));
        }
        
        socket.userId = device.userId;
      } else {
        socket.isDevice = false;
        socket.userId = decoded.id;
        
        // Verify user exists
        const user = await User.findById(socket.userId);
        if (!user) {
          return next(new Error('User not found'));
        }
      }
      
      next();
    } catch (error) {
      logger.error('WebSocket auth error:', error);
      next(new Error('Invalid token'));
    }
  });
  
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}, Type: ${socket.isDevice ? 'Device' : 'User'}, ID: ${socket.deviceId || socket.userId}`);
    
    // Store connection
    if (socket.isDevice) {
      deviceSockets.set(socket.deviceId, socket);
      
      // Update device status
      Device.findOneAndUpdate(
        { deviceId: socket.deviceId },
        { 
          'heartbeat.lastSeen': new Date(),
          'heartbeat.status': 'online',
          'tokens.socketId': socket.id
        }
      ).then(() => {
        // Notify user that device is online
        io.to(`user_${socket.userId}`).emit('device_status', {
          deviceId: socket.deviceId,
          status: 'online',
          timestamp: new Date()
        });
      }).catch(error => {
        logger.error('Update device status error:', error);
      });
    } else {
      userSockets.set(socket.userId, socket);
      socket.join(`user_${socket.userId}`);
    }
    
    // Handle device subscription
    socket.on('subscribe', async (data) => {
      const { deviceId } = data;
      
      if (!socket.isDevice) {
        // User subscribing to device updates
        const device = await Device.findOne({ deviceId, userId: socket.userId });
        if (device) {
          socket.join(`device_${deviceId}`);
          logger.info(`User ${socket.userId} subscribed to device ${deviceId}`);
          
          // Send current device status
          socket.emit('device_status', {
            deviceId,
            status: device.status,
            isOnline: device.isOnline,
            lastSeen: device.heartbeat.lastSeen,
            battery: device.battery,
            signal: device.signalInfo
          });
        }
      }
    });
    
    // Handle device unsubscription
    socket.on('unsubscribe', (data) => {
      const { deviceId } = data;
      socket.leave(`device_${deviceId}`);
      logger.info(`Client ${socket.id} unsubscribed from device ${deviceId}`);
    });
    
    // Handle device data update
    socket.on('device_data', async (data) => {
      if (!socket.isDevice) return;
      
      try {
        const { metrics, battery, signal, location } = data;
        const device = await Device.findOne({ deviceId: socket.deviceId });
        
        if (device) {
          // Update metrics
          if (metrics) {
            if (metrics.cpu) device.cpu = metrics.cpu;
            if (metrics.memory) device.memory = metrics.memory;
          }
          
          // Update battery
          if (battery) {
            device.battery = {
              ...device.battery,
              level: battery.level,
              isCharging: battery.isCharging,
              temperature: battery.temperature,
              lastUpdate: new Date()
            };
          }
          
          // Update signal
          if (signal) {
            device.signalInfo = {
              ...device.signalInfo,
              level: signal.level,
              type: signal.type,
              dBm: signal.dBm,
              networkType: signal.networkType,
              operator: signal.operator,
              lastUpdate: new Date()
            };
          }
          
          // Update location
          if (location) {
            device.location = {
              ...location,
              timestamp: new Date(),
              isRealtime: true
            };
            
            device.locationHistory.push({
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              speed: location.speed,
              timestamp: new Date()
            });
            
            // Keep last 1000 locations
            if (device.locationHistory.length > 1000) {
              device.locationHistory = device.locationHistory.slice(-1000);
            }
          }
          
          device.heartbeat.lastSeen = new Date();
          await device.save();
          
          // Broadcast to subscribers
          io.to(`device_${socket.deviceId}`).emit('device_update', {
            deviceId: socket.deviceId,
            metrics: {
              cpu: device.cpu,
              memory: device.memory,
              battery: device.battery.level,
              signal: device.signalInfo.level
            },
            location: location ? device.location : null,
            timestamp: new Date()
          });
          
          // Update cache
          await cache.set(`device_${socket.deviceId}`, device, 60);
        }
      } catch (error) {
        logger.error('Device data update error:', error);
        socket.emit('error', { message: 'Failed to update device data' });
      }
    });
    
    // Handle command result
    socket.on('command_result', async (data) => {
      if (!socket.isDevice) return;
      
      try {
        const { commandId, status, result, error } = data;
        
        const device = await Device.findOne({ deviceId: socket.deviceId });
        if (device) {
          const command = device.commandQueue.find(c => c.id === commandId);
          if (command) {
            command.status = status;
            if (result) command.result = result;
            if (error) command.error = error;
            command.executedAt = new Date();
            if (status === 'completed' || status === 'failed') {
              command.completedAt = new Date();
            }
            await device.save();
            
            // Notify user
            if (device.userId) {
              io.to(`user_${device.userId}`).emit('command_completed', {
                commandId,
                deviceId: socket.deviceId,
                status,
                result,
                error,
                timestamp: new Date()
              });
            }
          }
        }
      } catch (error) {
        logger.error('Command result error:', error);
      }
    });
    
    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`Client disconnected: ${socket.id}`);
      
      if (socket.isDevice) {
        deviceSockets.delete(socket.deviceId);
        
        // Update device status to offline after timeout
        setTimeout(async () => {
          const device = await Device.findOne({ deviceId: socket.deviceId });
          if (device && device.heartbeat.status === 'online') {
            const timeout = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD) || 180000;
            const lastSeen = new Date(device.heartbeat.lastSeen).getTime();
            
            if (Date.now() - lastSeen > timeout) {
              device.heartbeat.status = 'offline';
              await device.save();
              
              // Notify user
              if (device.userId) {
                io.to(`user_${device.userId}`).emit('device_status', {
                  deviceId: socket.deviceId,
                  status: 'offline',
                  timestamp: new Date()
                });
              }
            }
          }
        }, 5000);
      } else {
        userSockets.delete(socket.userId);
      }
    });
  });
};

// Helper functions
const sendToDevice = (deviceId, event, data) => {
  const socket = deviceSockets.get(deviceId);
  if (socket && socket.connected) {
    socket.emit(event, data);
    return true;
  }
  return false;
};

const sendToUser = (userId, event, data) => {
  const socket = userSockets.get(userId);
  if (socket && socket.connected) {
    socket.emit(event, data);
    return true;
  }
  return false;
};

const broadcastToDeviceSubscribers = (deviceId, event, data) => {
  const io = require('../app').io;
  io.to(`device_${deviceId}`).emit(event, data);
};

const getConnectedDevices = () => {
  return Array.from(deviceSockets.keys());
};

const getConnectedUsers = () => {
  return Array.from(userSockets.keys());
};

module.exports = {
  setupWebSocket,
  sendToDevice,
  sendToUser,
  broadcastToDeviceSubscribers,
  getConnectedDevices,
  getConnectedUsers
};
