const User = require('../models/User');
const Device = require('../models/Device');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');
const encryptionService = require('../services/encryptionService');

// Get user settings
const getUserSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `user_settings_${userId}`;
    
    let settings = await cache.get(cacheKey);
    
    if (!settings) {
      const user = await User.findById(userId).select('preferences');
      settings = user?.preferences || {};
      await cache.set(cacheKey, settings, 300);
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Get user settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update user settings
const updateUserSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body;
    
    const allowedUpdates = ['theme', 'language', 'timezone', 'notifications', 'dashboard'];
    const filteredUpdates = {};
    
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { preferences: filteredUpdates } },
      { new: true }
    ).select('preferences');
    
    // Clear cache
    await cache.del(`user_settings_${userId}`);
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: user?.preferences
    });
  } catch (error) {
    logger.error('Update user settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get device settings
const getDeviceSettings = async (req, res) => {
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
    
    const settings = {
      alertThresholds: device.alertThresholds,
      monitoring: device.monitoring,
      notifications: device.notifications
    };
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Get device settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update device settings
const updateDeviceSettings = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const updates = req.body;
    
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    const allowedUpdates = ['alertThresholds', 'monitoring', 'notifications'];
    for (const key of allowedUpdates) {
      if (updates[key]) {
        device[key] = { ...device[key], ...updates[key] };
      }
    }
    
    await device.save();
    
    res.json({
      success: true,
      message: 'Device settings updated successfully',
      data: {
        alertThresholds: device.alertThresholds,
        monitoring: device.monitoring,
        notifications: device.notifications
      }
    });
  } catch (error) {
    logger.error('Update device settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get notification settings
const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('preferences.notifications');
    
    res.json({
      success: true,
      data: user?.preferences?.notifications || {
        email: true,
        push: true,
        alerts: true,
        commands: true
      }
    });
  } catch (error) {
    logger.error('Get notification settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { email, push, alerts, commands } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'preferences.notifications': {
            email: email !== undefined ? email : true,
            push: push !== undefined ? push : true,
            alerts: alerts !== undefined ? alerts : true,
            commands: commands !== undefined ? commands : true
          }
        }
      },
      { new: true }
    ).select('preferences.notifications');
    
    // Clear cache
    await cache.del(`user_settings_${userId}`);
    
    res.json({
      success: true,
      message: 'Notification settings updated',
      data: user?.preferences?.notifications
    });
  } catch (error) {
    logger.error('Update notification settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get API keys
const getApiKeys = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('apiKeys');
    
    // Mask API keys for security
    const maskedKeys = user?.apiKeys?.map(key => ({
      ...key.toObject(),
      key: encryptionService.maskSensitiveData(key.key, 8, 8)
    })) || [];
    
    res.json({
      success: true,
      data: maskedKeys
    });
  } catch (error) {
    logger.error('Get API keys error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate API key
const generateApiKey = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, permissions } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const apiKey = encryptionService.generateApiKey();
    user.apiKeys.push({
      key: apiKey,
      name: name || `API Key ${user.apiKeys.length + 1}`,
      permissions: permissions || ['read'],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    });
    
    await user.save();
    
    res.json({
      success: true,
      message: 'API key generated',
      data: {
        key: apiKey, // Show full key only once
        name: name || `API Key ${user.apiKeys.length}`,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
  } catch (error) {
    logger.error('Generate API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Revoke API key
const revokeApiKey = async (req, res) => {
  try {
    const userId = req.user._id;
    const { keyId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const keyIndex = user.apiKeys.findIndex(k => k._id.toString() === keyId);
    if (keyIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }
    
    user.apiKeys.splice(keyIndex, 1);
    await user.save();
    
    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke API key error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getUserSettings,
  updateUserSettings,
  getDeviceSettings,
  updateDeviceSettings,
  getNotificationSettings,
  updateNotificationSettings,
  getApiKeys,
  generateApiKey,
  revokeApiKey
};
