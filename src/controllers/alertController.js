const Alert = require('../models/Alert');
const alertService = require('../services/alertService');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');

// Get all alerts for user
const getAlerts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, type, severity, limit = 50, page = 1 } = req.query;

    const query = { userId };
    if (status) query.status = status;
    if (type) query.type = type;
    if (severity) query.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(query);

    res.json({
      success: true,
      data: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get alerts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get active alerts
const getActiveAlerts = async (req, res) => {
  try {
    const userId = req.user._id;
    const alerts = await alertService.getActiveAlerts(userId);

    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    logger.error('Get active alerts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get alert by ID
const getAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const alert = await Alert.findOne({ alertId: id, userId });
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    logger.error('Get alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Acknowledge alert
const acknowledgeAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userName = req.user.name;

    const alert = await alertService.acknowledgeAlert(id, userId, userName);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert acknowledged',
      data: alert
    });
  } catch (error) {
    logger.error('Acknowledge alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Resolve alert
const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    const alert = await alertService.resolveAlert(id, userId, userName, message);
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert resolved',
      data: alert
    });
  } catch (error) {
    logger.error('Resolve alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get alert statistics
const getAlertStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const stats = await alertService.getAlertStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get alert stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete alert
const deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const alert = await Alert.findOneAndDelete({ alertId: id, userId });
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    // Clear cache
    await cache.del(`alerts_${userId}`);
    await cache.del(`alert_stats_${userId}`);

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (error) {
    logger.error('Delete alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAlerts,
  getActiveAlerts,
  getAlert,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats,
  deleteAlert
};
