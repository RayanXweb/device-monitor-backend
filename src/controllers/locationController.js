const Device = require('../models/Device');
const { sendToDevice } = require('../services/websocketService');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');
const axios = require('axios');

// Get current location
const getCurrentLocation = async (req, res) => {
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

    // Check cache
    const cacheKey = `location_${deviceId}`;
    let location = await cache.get(cacheKey);

    if (!location) {
      if (device.location && device.location.timestamp) {
        const now = new Date();
        const lastUpdate = new Date(device.location.timestamp);
        const diffMinutes = (now - lastUpdate) / 1000 / 60;

        // Use cached location if less than 5 minutes old
        if (diffMinutes < 5) {
          location = device.location;
        } else if (device.isOnline) {
          // Request fresh location
          const commandId = require('uuid').v4();
          sendToDevice(deviceId, 'get_location', {
            commandId,
            timestamp: new Date().toISOString()
          });
          location = device.location;
        } else {
          location = device.location;
        }
      } else {
        location = null;
      }

      if (location) {
        await cache.set(cacheKey, location, 300); // Cache for 5 minutes
      }
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    logger.error('Get current location error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update location (called by device)
const updateLocation = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { latitude, longitude, accuracy, speed, altitude, provider } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Reverse geocoding to get address
    let address = null;
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const geoResponse = await axios.get(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
        if (geoResponse.data.results && geoResponse.data.results[0]) {
          address = geoResponse.data.results[0].formatted_address;
        }
      } catch (error) {
        logger.error('Reverse geocoding error:', error);
      }
    }

    // Update device location
    device.location = {
      latitude,
      longitude,
      accuracy,
      speed,
      altitude,
      provider,
      address,
      timestamp: new Date(),
      isRealtime: true
    };

    // Add to history
    device.locationHistory.push({
      latitude,
      longitude,
      accuracy,
      speed,
      altitude,
      timestamp: new Date()
    });

    // Keep last 1000 locations
    if (device.locationHistory.length > 1000) {
      device.locationHistory = device.locationHistory.slice(-1000);
    }

    await device.save();

    // Update cache
    await cache.set(`location_${deviceId}`, device.location, 60);

    // Notify subscribers via WebSocket
    const io = req.app.get('io');
    io.to(`device_${deviceId}`).emit('location_updated', {
      deviceId,
      location: device.location,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Location updated',
      data: device.location
    });
  } catch (error) {
    logger.error('Update location error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get location history
const getLocationHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const { startDate, endDate, limit = 100, page = 1 } = req.query;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    let history = [...device.locationHistory];

    // Filter by date
    if (startDate) {
      const start = new Date(startDate);
      history = history.filter(loc => new Date(loc.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      history = history.filter(loc => new Date(loc.timestamp) <= end);
    }

    // Sort by timestamp descending
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedHistory = history.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: paginatedHistory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: history.length,
        pages: Math.ceil(history.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get location history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Request location update
const requestLocation = async (req, res) => {
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

    const commandId = require('uuid').v4();
    const sent = sendToDevice(deviceId, 'get_location', {
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
      message: 'Location request sent',
      data: { commandId }
    });
  } catch (error) {
    logger.error('Request location error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get location stats
const getLocationStats = async (req, res) => {
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

    const history = device.locationHistory;
    const totalPoints = history.length;
    
    // Calculate bounds
    let bounds = null;
    if (totalPoints > 0) {
      bounds = {
        minLat: Math.min(...history.map(p => p.latitude)),
        maxLat: Math.max(...history.map(p => p.latitude)),
        minLng: Math.min(...history.map(p => p.longitude)),
        maxLng: Math.max(...history.map(p => p.longitude))
      };
    }

    // Calculate average accuracy
    const avgAccuracy = totalPoints > 0
      ? history.reduce((sum, p) => sum + (p.accuracy || 0), 0) / totalPoints
      : 0;

    // Get last 7 days activity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentActivity = history.filter(p => new Date(p.timestamp) >= sevenDaysAgo).length;

    res.json({
      success: true,
      data: {
        totalPoints,
        avgAccuracy: avgAccuracy.toFixed(2),
        recentActivity,
        bounds,
        lastLocation: device.location,
        lastUpdate: device.location?.timestamp || null
      }
    });
  } catch (error) {
    logger.error('Get location stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getCurrentLocation,
  updateLocation,
  getLocationHistory,
  requestLocation,
  getLocationStats
};
