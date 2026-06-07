const Device = require('../models/Device');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// List files
const listFiles = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { path: dirPath = '/' } = req.query;
    
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
    const sent = sendToDevice(deviceId, 'list_files', {
      commandId,
      path: dirPath,
      timestamp: new Date().toISOString()
    });
    
    if (!sent) {
      return res.status(400).json({
        success: false,
        error: 'Failed to send command to device'
      });
    }
    
    // Store pending request
    const pendingRequests = device.pendingRequests || {};
    pendingRequests[commandId] = {
      type: 'list_files',
      resolve: null,
      reject: null,
      timestamp: Date.now()
    };
    device.pendingRequests = pendingRequests;
    await device.save();
    
    // Set timeout
    const timeout = setTimeout(() => {
      if (pendingRequests[commandId]) {
        delete pendingRequests[commandId];
        device.save();
      }
    }, 30000);
    
    // Wait for response (simplified - in production use Promise with timeout)
    res.json({
      success: true,
      message: 'List files command sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('List files error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Download file
const downloadFile = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { filePath } = req.body;
    
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
    const sent = sendToDevice(deviceId, 'download_file', {
      commandId,
      path: filePath,
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
      message: 'Download command sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Download file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Receive file from device
const receiveFile = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { filePath, fileData, commandId } = req.body;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Create upload directory
    const uploadDir = path.join(__dirname, '../../uploads/files');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Save file
    const filename = path.basename(filePath);
    const uniqueFilename = `${deviceId}_${Date.now()}_${filename}`;
    const filepath = path.join(uploadDir, uniqueFilename);
    const relativePath = `/uploads/files/${uniqueFilename}`;
    
    // Convert base64 to buffer and save
    const base64Data = fileData.replace(/^data:application\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, buffer);
    
    res.json({
      success: true,
      message: 'File received',
      data: { path: relativePath, filename: uniqueFilename }
    });
  } catch (error) {
    logger.error('Receive file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete file
const deleteFile = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { filePath } = req.body;
    
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
    const sent = sendToDevice(deviceId, 'delete_file', {
      commandId,
      path: filePath,
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
      message: 'Delete command sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Upload file to device
const uploadFile = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { destinationPath } = req.body;
    const file = req.files?.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
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
    
    // Convert file to base64
    const fileData = file.data.toString('base64');
    const mimeType = file.mimetype;
    const fullFileData = `data:${mimeType};base64,${fileData}`;
    
    const commandId = uuidv4();
    const sent = sendToDevice(deviceId, 'upload_file', {
      commandId,
      path: destinationPath || '/',
      filename: file.name,
      fileData: fullFileData,
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
      message: 'Upload command sent',
      data: { commandId, filename: file.name }
    });
  } catch (error) {
    logger.error('Upload file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  listFiles,
  downloadFile,
  receiveFile,
  deleteFile,
  uploadFile
};
