const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');

// User authentication middleware
const auth = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    }
    
    // Check for API key
    const apiKey = req.header('X-API-Key');
    if (!token && apiKey) {
      token = apiKey;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
    }
    
    // Check if token is blacklisted
    const isBlacklisted = await cache.get(`blacklist_${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        error: 'Token has been revoked'
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token has expired'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    // Check if it's an API key (no user lookup needed)
    if (decoded.type === 'api') {
      req.isApiKey = true;
      req.apiKeyId = decoded.id;
      return next();
    }
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password -refreshTokens');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }
    
    // Check if user is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return res.status(401).json({
        success: false,
        error: 'Account is locked'
      });
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Device authentication middleware
const deviceAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No device token provided'
      });
    }
    
    // Verify device token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid device token'
      });
    }
    
    if (decoded.type !== 'device') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token type'
      });
    }
    
    const device = await Device.findOne({ deviceId: decoded.deviceId });
    if (!device) {
      return res.status(401).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    if (device.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'Device not activated'
      });
    }
    
    req.device = device;
    req.deviceId = device.deviceId;
    
    next();
  } catch (error) {
    logger.error('Device auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Device authentication failed'
    });
  }
};

// Role-based authorization
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Permission-based authorization
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        error: `Missing required permission: ${permission}`
      });
    }
    
    next();
  };
};

// Device ownership check
const checkDeviceOwnership = async (req, res, next) => {
  try {
    const deviceId = req.params.deviceId || req.params.id;
    const userId = req.user._id;
    
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found or access denied'
      });
    }
    
    req.device = device;
    next();
  } catch (error) {
    logger.error('Device ownership check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify device ownership'
    });
  }
};

module.exports = {
  auth,
  deviceAuth,
  authorize,
  hasPermission,
  checkDeviceOwnership
};
