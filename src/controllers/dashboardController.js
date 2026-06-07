const Device = require('../models/Device');
const Command = require('../models/Command');
const Alert = require('../models/Alert');
const Notification = require('../models/Notification');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');

// Get dashboard statistics
const getStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `dashboard_stats_${userId}`;
    
    let stats = await cache.get(cacheKey);
    
    if (!stats) {
      // Device stats
      const devices = await Device.find({ userId });
      const totalDevices = devices.length;
      const onlineDevices = devices.filter(d => d.isOnline).length;
      const offlineDevices = totalDevices - onlineDevices;
      
      // Command stats
      const commandStats = await Command.getCommandStats(userId);
      
      // Alert stats
      const alertStats = await Alert.getAlertStats(userId);
      
      // Notification stats
      const unreadNotifications = await Notification.getUnreadCount(userId);
      
      // Calculate average metrics
      const avgCpu = devices.reduce((sum, d) => sum + (d.cpu || 0), 0) / (totalDevices || 1);
      const avgMemory = devices.reduce((sum, d) => sum + (d.memory || 0), 0) / (totalDevices || 1);
      const avgBattery = devices.reduce((sum, d) => sum + (d.battery?.level || 0), 0) / (totalDevices || 1);
      
      stats = {
        devices: {
          total: totalDevices,
          online: onlineDevices,
          offline: offlineDevices,
          onlinePercentage: totalDevices ? ((onlineDevices / totalDevices) * 100).toFixed(1) : 0
        },
        metrics: {
          avgCpu: avgCpu.toFixed(1),
          avgMemory: avgMemory.toFixed(1),
          avgBattery: avgBattery.toFixed(1)
        },
        commands: commandStats,
        alerts: alertStats,
        notifications: {
          unread: unreadNotifications
        }
      };
      
      await cache.set(cacheKey, stats, 30); // Cache for 30 seconds
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get recent activity
const getRecentActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20 } = req.query;
    
    // Get recent commands
    const recentCommands = await Command.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Get recent alerts
    const recentAlerts = await Alert.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Get recent devices
    const recentDevices = await Device.find({ userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Combine and sort activities
    const activities = [];
    
    recentCommands.forEach(cmd => {
      activities.push({
        type: 'command',
        id: cmd.commandId,
        title: `Command Executed: ${cmd.type}`,
        description: `Status: ${cmd.status}`,
        timestamp: cmd.createdAt,
        data: cmd
      });
    });
    
    recentAlerts.forEach(alert => {
      activities.push({
        type: 'alert',
        id: alert.alertId,
        title: alert.title,
        description: alert.message,
        timestamp: alert.createdAt,
        data: alert
      });
    });
    
    recentDevices.forEach(device => {
      activities.push({
        type: 'device',
        id: device.deviceId,
        title: `Device ${device.status === 'active' ? 'Activated' : 'Registered'}`,
        description: device.deviceName,
        timestamp: device.createdAt,
        data: device
      });
    });
    
    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      data: activities.slice(0, parseInt(limit))
    });
  } catch (error) {
    logger.error('Get recent activity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get device analytics
const getDeviceAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, days = 7 } = req.query;
    
    const query = { userId };
    if (deviceId) query.deviceId = deviceId;
    
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get command analytics
    const commandAnalytics = await Command.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Get alert analytics
    const alertAnalytics = await Alert.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
        warning: { $sum: { $cond: [{ $eq: ['$severity', 'warning'] }, 1, 0] } },
        info: { $sum: { $cond: [{ $eq: ['$severity', 'info'] }, 1, 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        commands: commandAnalytics,
        alerts: alertAnalytics,
        period: {
          days: parseInt(days),
          since
        }
      }
    });
  } catch (error) {
    logger.error('Get device analytics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get system health
const getSystemHealth = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get database stats
    const dbStats = await mongoose.connection.db.stats();
    
    // Get device health
    const devices = await Device.find({ userId });
    const onlineDevices = devices.filter(d => d.isOnline).length;
    const devicesWithIssues = devices.filter(d => {
      return (d.cpu > 80) || (d.memory > 85) || (d.battery?.level < 20);
    }).length;
    
    // Get command health
    const recentCommands = await Command.find({
      userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const commandSuccessRate = recentCommands.length
      ? (recentCommands.filter(c => c.status === 'completed').length / recentCommands.length) * 100
      : 100;
    
    const health = {
      status: 'healthy',
      database: {
        status: 'connected',
        size: dbStats.dataSize,
        collections: dbStats.collections
      },
      devices: {
        total: devices.length,
        online: onlineDevices,
        withIssues: devicesWithIssues,
        healthScore: devices.length ? ((onlineDevices - devicesWithIssues) / devices.length) * 100 : 100
      },
      commands: {
        total24h: recentCommands.length,
        successRate: commandSuccessRate.toFixed(1)
      },
      timestamp: new Date()
    };
    
    // Determine overall status
    if (health.devices.healthScore < 50 || health.commands.successRate < 70) {
      health.status = 'degraded';
    } else if (health.devices.online === 0) {
      health.status = 'warning';
    }
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Get system health error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getStats,
  getRecentActivity,
  getDeviceAnalytics,
  getSystemHealth
};
