const Device = require('../models/Device');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Get SMS messages
const getSMS = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { limit = 100, page = 1, type, search } = req.query;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    let messages = device.sms || [];
    
    // Filter by type
    if (type) {
      messages = messages.filter(m => m.type === type);
    }
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      messages = messages.filter(m => 
        m.address?.toLowerCase().includes(searchLower) ||
        m.body?.toLowerCase().includes(searchLower) ||
        m.contactName?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by date
    messages.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedMessages = messages.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: messages.length,
        pages: Math.ceil(messages.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Sync SMS from device
const syncSMS = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { messages } = req.body;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    // Merge messages (keep last 1000)
    const existingIds = new Set(device.sms.map(m => m.id));
    const newMessages = messages.filter(m => !existingIds.has(m.id));
    
    device.sms = [...newMessages, ...device.sms].slice(0, 1000);
    await device.save();
    
    res.json({
      success: true,
      message: `Synced ${newMessages.length} new messages`,
      total: device.sms.length
    });
  } catch (error) {
    logger.error('Sync SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Send SMS
const sendSMS = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { number, message } = req.body;
    
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
    const sent = sendToDevice(deviceId, 'send_sms', {
      commandId,
      number,
      message,
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
      message: 'SMS send command sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Send SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get contacts
const getContacts = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { search, limit = 100 } = req.query;
    
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    let contacts = device.contacts || [];
    
    if (search) {
      const searchLower = search.toLowerCase();
      contacts = contacts.filter(c => 
        c.name?.toLowerCase().includes(searchLower) ||
        c.number?.toLowerCase().includes(searchLower)
      );
    }
    
    contacts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    res.json({
      success: true,
      data: contacts.slice(0, parseInt(limit)),
      total: contacts.length
    });
  } catch (error) {
    logger.error('Get contacts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Sync contacts
const syncContacts = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { contacts } = req.body;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    device.contacts = contacts;
    await device.save();
    
    res.json({
      success: true,
      message: `Synced ${contacts.length} contacts`,
      total: device.contacts.length
    });
  } catch (error) {
    logger.error('Sync contacts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get call logs
const getCallLogs = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { limit = 100, page = 1 } = req.query;
    
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    const logs = device.callLogs || [];
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedLogs = logs.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: paginatedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: logs.length,
        pages: Math.ceil(logs.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get call logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Sync call logs
const syncCallLogs = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { callLogs } = req.body;
    
    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    device.callLogs = callLogs.slice(0, 500);
    await device.save();
    
    res.json({
      success: true,
      message: `Synced ${callLogs.length} call logs`,
      total: device.callLogs.length
    });
  } catch (error) {
    logger.error('Sync call logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getSMS,
  syncSMS,
  sendSMS,
  getContacts,
  syncContacts,
  getCallLogs,
  syncCallLogs
};
