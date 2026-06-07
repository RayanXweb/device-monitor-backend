const Device = require('../models/Device');
const User = require('../models/User');
const Alert = require('../models/Alert');
const { cache } = require('../config/redis');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const crypto = require('crypto');

// Generate activation PIN
const generatePIN = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    
    // Check if device exists
    let device = await Device.findOne({ deviceId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Check if device is already activated
    if (device.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Device already activated'
      });
    }
    
    // Generate 6-digit PIN
    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const pinExpiresAt = new Date(Date.now() + (parseInt(process.env.PIN_EXPIRY_MINUTES) || 5) * 60 * 1000);
    
    device.activationStatus = {
      pinCode,
      pinExpiresAt,
      pinAttempts: 0,
      activatedBy: userId
    };
    
    await device.save();
    
    // Add audit log
    await User.findByIdAndUpdate(userId, {
      $push: {
        auditLog: {
          action: 'GENERATE_PIN',
          resource: 'Device',
          resourceId: deviceId,
          details: { pinExpiresAt },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      data: {
        pin: pinCode,
        expiresAt: pinExpiresAt
      }
    });
  } catch (error) {
    logger.error('Generate PIN error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Verify PIN and activate device
const verifyPIN = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { pin } = req.body;
    
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Check if already activated
    if (device.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Device already activated'
      });
    }
    
    // Check PIN
    if (!device.activationStatus.pinCode || device.activationStatus.pinCode !== pin) {
      device.activationStatus.pinAttempts += 1;
      await device.save();
      
      const remainingAttempts = 3 - device.activationStatus.pinAttempts;
      return res.status(401).json({
        success: false,
        error: `Invalid PIN. ${remainingAttempts} attempts remaining`
      });
    }
    
    // Check expiry
    if (new Date() > device.activationStatus.pinExpiresAt) {
      return res.status(401).json({
        success: false,
        error: 'PIN has expired. Please generate a new PIN'
      });
    }
    
    // Activate device
    device.status = 'active';
    device.userId = device.activationStatus.activatedBy;
    device.activationStatus.activatedAt = new Date();
    device.activationStatus.pinCode = null;
    device.activationStatus.pinExpiresAt = null;
    
    // Generate device token
    const deviceToken = crypto.randomBytes(32).toString('hex');
    device.tokens = {
      accessToken: deviceToken,
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
    
    await device.save();
    
    // Add to user's devices
    await User.findByIdAndUpdate(device.userId, {
      $push: {
        devices: {
          deviceId: device.deviceId,
          activatedAt: new Date(),
          isActive: true
        }
      },
      $push: {
        auditLog: {
          action: 'ACTIVATE_DEVICE',
          resource: 'Device',
          resourceId: deviceId,
          details: {},
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Device activated successfully',
      data: {
        token: deviceToken,
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          status: device.status
        }
      }
    });
  } catch (error) {
    logger.error('Verify PIN error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Register/Update device (called by client app)
const registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceName, platform, brand, model, androidVersion } = req.body;
    
    let device = await Device.findOne({ deviceId });
    
    if (!device) {
      // Create new device
      device = new Device({
        deviceId,
        deviceName,
        platform,
        brand,
        model,
        androidVersion,
        status: 'pending',
        heartbeat: {
          lastSeen: new Date(),
          status: 'online'
        }
      });
      await device.save();
      
      logger.info(`New device registered: ${deviceId}`);
    } else {
      // Update existing device
      device.deviceName = deviceName || device.deviceName;
      device.brand = brand || device.brand;
      device.model = model || device.model;
      device.androidVersion = androidVersion || device.androidVersion;
      device.heartbeat.lastSeen = new Date();
      device.heartbeat.status = 'online';
      await device.save();
    }
    
    res.json({
      success: true,
      message: device.status === 'pending' ? 'Device registered. Awaiting activation.' : 'Device updated',
      data: {
        deviceId: device.deviceId,
        status: device.status,
        requiresActivation: device.status === 'pending'
      }
    });
  } catch (error) {
    logger.error('Register device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all devices for user
const getDevices = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, search, page = 1, limit = 20 } = req.query;
    
    const query = { userId };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { deviceName: { $regex: search, $options: 'i' } },
        { deviceId: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const devices = await Device.find(query)
      .sort({ 'heartbeat.lastSeen': -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Device.countDocuments(query);
    
    // Update online status for each device
    for (const device of devices) {
      const wasOffline = device.status === 'active' && !device.isOnline;
      if (wasOffline) {
        device.heartbeat.status = 'offline';
        await device.save();
      }
    }
    
    res.json({
      success: true,
      data: devices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get device by ID
const getDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const device = await Device.findOne({ deviceId: id, userId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Update online status
    const wasOffline = device.status === 'active' && !device.isOnline;
    if (wasOffline) {
      device.heartbeat.status = 'offline';
      await device.save();
    }
    
    res.json({
      success: true,
      data: device
    });
  } catch (error) {
    logger.error('Get device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update device
const updateDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updates = req.body;
    
    const device = await Device.findOne({ deviceId: id, userId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Allowed updates
    const allowedUpdates = ['deviceName', 'alertThresholds', 'metadata'];
    for (const update of allowedUpdates) {
      if (updates[update]) {
        device[update] = updates[update];
      }
    }
    
    await device.save();
    
    // Add audit log
    await User.findByIdAndUpdate(userId, {
      $push: {
        auditLog: {
          action: 'UPDATE_DEVICE',
          resource: 'Device',
          resourceId: id,
          details: updates,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        }
      }
    });
    
    res.json({
      success: true,
      message: 'Device updated successfully',
      data: device
    });
  } catch (error) {
    logger.error('Update device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete device
const deleteDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const device = await Device.findOneAndDelete({ deviceId: id, userId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Remove from user's devices
    await User.findByIdAndUpdate(userId, {
      $pull: { devices: { deviceId: id } },
      $push: {
        auditLog: {
          action: 'DELETE_DEVICE',
          resource: 'Device',
          resourceId: id,
          details: {},
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        }
      }
    });
    
    // Delete related data
    await Alert.deleteMany({ deviceId: id });
    
    // Clear cache
    await cache.del(`device_${id}`);
    
    res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (error) {
    logger.error('Delete device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update device heartbeat (called by client app)
const updateHeartbeat = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { battery, signal, appVersion, latency } = req.body;
    
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    await device.updateHeartbeat({
      battery,
      signal,
      appVersion,
      latency
    });
    
    // Update online status in cache
    await cache.set(`device_online_${deviceId}`, 'true', 60);
    
    res.json({
      success: true,
      message: 'Heartbeat updated'
    });
  } catch (error) {
    logger.error('Update heartbeat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get device stats
const getDeviceStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const cacheKey = `user_stats_${userId}`;
    let stats = await cache.get(cacheKey);
    
    if (!stats) {
      const devices = await Device.find({ userId });
      
      const total = devices.length;
      const online = devices.filter(d => d.isOnline).length;
      const offline = total - online;
      const avgCpu = devices.reduce((sum, d) => sum + (d.cpu || 0), 0) / (total || 1);
      const avgMemory = devices.reduce((sum, d) => sum + (d.memory || 0), 0) / (total || 1);
      const activeAlerts = await Alert.countDocuments({ 
        deviceId: { $in: devices.map(d => d.deviceId) },
        status: 'active'
      });
      
      stats = {
        total,
        online,
        offline,
        avgCpu: avgCpu.toFixed(1),
        avgMemory: avgMemory.toFixed(1),
        activeAlerts,
        onlinePercentage: total ? ((online / total) * 100).toFixed(1) : 0
      };
      
      await cache.set(cacheKey, stats, 30);
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get device stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  generatePIN,
  verifyPIN,
  registerDevice,
  getDevices,
  getDevice,
  updateDevice,
  deleteDevice,
  updateHeartbeat,
  getDeviceStats
};
