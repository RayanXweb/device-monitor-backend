const Alert = require('../models/Alert');
const Device = require('../models/Device');
const notificationService = require('./notificationService');
const { logger } = require('../utils/logger');
const { cache } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

class AlertService {
  // Check device thresholds and create alerts
  async checkDeviceThresholds(device) {
    const alerts = [];

    // CPU threshold
    if (device.cpu && device.cpu > device.alertThresholds?.cpu) {
      const alert = await this.createAlert({
        deviceId: device.deviceId,
        userId: device.userId,
        type: 'cpu',
        severity: device.cpu > 90 ? 'critical' : 'warning',
        title: 'High CPU Usage',
        message: `CPU usage is at ${device.cpu}% (threshold: ${device.alertThresholds?.cpu}%)`,
        value: device.cpu,
        threshold: device.alertThresholds?.cpu
      });
      if (alert) alerts.push(alert);
    }

    // Memory threshold
    if (device.memory && device.memory > device.alertThresholds?.memory) {
      const alert = await this.createAlert({
        deviceId: device.deviceId,
        userId: device.userId,
        type: 'memory',
        severity: device.memory > 95 ? 'critical' : 'warning',
        title: 'High Memory Usage',
        message: `Memory usage is at ${device.memory}% (threshold: ${device.alertThresholds?.memory}%)`,
        value: device.memory,
        threshold: device.alertThresholds?.memory
      });
      if (alert) alerts.push(alert);
    }

    // Battery threshold
    if (device.battery?.level && device.battery.level < (device.alertThresholds?.battery || 20)) {
      const alert = await this.createAlert({
        deviceId: device.deviceId,
        userId: device.userId,
        type: 'battery',
        severity: device.battery.level < 10 ? 'critical' : 'warning',
        title: 'Low Battery',
        message: `Battery level is at ${device.battery.level}%`,
        value: device.battery.level,
        threshold: device.alertThresholds?.battery || 20
      });
      if (alert) alerts.push(alert);
    }

    // Signal threshold
    if (device.signalInfo?.level && device.signalInfo.level < (device.alertThresholds?.signal || 30)) {
      const alert = await this.createAlert({
        deviceId: device.deviceId,
        userId: device.userId,
        type: 'signal',
        severity: device.signalInfo.level < 15 ? 'critical' : 'warning',
        title: 'Weak Signal',
        message: `Signal strength is at ${device.signalInfo.level}%`,
        value: device.signalInfo.level,
        threshold: device.alertThresholds?.signal || 30
      });
      if (alert) alerts.push(alert);
    }

    return alerts;
  }

  // Create new alert
  async createAlert(alertData) {
    try {
      // Check if similar alert already exists and is active
      const existingAlert = await Alert.findOne({
        deviceId: alertData.deviceId,
        type: alertData.type,
        status: 'active'
      });

      if (existingAlert) {
        // Update existing alert
        existingAlert.value = alertData.value;
        existingAlert.updatedAt = new Date();
        await existingAlert.save();
        return existingAlert;
      }

      // Create new alert
      const alert = new Alert({
        alertId: uuidv4(),
        ...alertData,
        status: 'active',
        createdAt: new Date()
      });

      await alert.save();

      // Send notifications
      await notificationService.sendAlertNotification(alert, alertData.userId);

      // Clear cache
      await cache.del(`alerts_${alertData.userId}`);

      logger.info(`Alert created: ${alert.title} for device ${alert.deviceId}`);
      return alert;
    } catch (error) {
      logger.error('Create alert error:', error);
      return null;
    }
  }

  // Create offline alert
  async createOfflineAlert(device) {
    const existingAlert = await Alert.findOne({
      deviceId: device.deviceId,
      type: 'offline',
      status: 'active'
    });

    if (existingAlert) return existingAlert;

    const alert = await this.createAlert({
      deviceId: device.deviceId,
      userId: device.userId,
      type: 'offline',
      severity: 'warning',
      title: 'Device Offline',
      message: `${device.deviceName} has gone offline`,
      value: 0,
      threshold: null
    });

    return alert;
  }

  // Create online alert
  async createOnlineAlert(device) {
    // Resolve offline alerts
    await Alert.updateMany(
      {
        deviceId: device.deviceId,
        type: 'offline',
        status: 'active'
      },
      {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedMessage: 'Device came back online'
      }
    );

    const alert = await this.createAlert({
      deviceId: device.deviceId,
      userId: device.userId,
      type: 'online',
      severity: 'info',
      title: 'Device Online',
      message: `${device.deviceName} is back online`,
      value: 100,
      threshold: null
    });

    return alert;
  }

  // Get active alerts for user
  async getActiveAlerts(userId, limit = 50) {
    const cacheKey = `alerts_${userId}`;
    let alerts = await cache.get(cacheKey);

    if (!alerts) {
      alerts = await Alert.find({ userId, status: 'active' })
        .sort({ createdAt: -1 })
        .limit(limit);
      await cache.set(cacheKey, alerts, 30);
    }

    return alerts;
  }

  // Acknowledge alert
  async acknowledgeAlert(alertId, userId, userName) {
    const alert = await Alert.findOne({ alertId });
    if (!alert) return null;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = {
      userId,
      userName,
      acknowledgedAt: new Date()
    };
    await alert.save();

    // Clear cache
    await cache.del(`alerts_${alert.userId}`);

    return alert;
  }

  // Resolve alert
  async resolveAlert(alertId, userId, userName, message) {
    const alert = await Alert.findOne({ alertId });
    if (!alert) return null;

    alert.status = 'resolved';
    alert.resolvedBy = {
      userId,
      userName,
      resolvedAt: new Date()
    };
    alert.resolvedMessage = message;
    await alert.save();

    // Clear cache
    await cache.del(`alerts_${alert.userId}`);

    return alert;
  }

  // Get alert statistics
  async getAlertStats(userId) {
    const cacheKey = `alert_stats_${userId}`;
    let stats = await cache.get(cacheKey);

    if (!stats) {
      stats = await Alert.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
        { $group: {
          _id: '$severity',
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }
        }}
      ]);

      const result = {
        critical: { total: 0, active: 0 },
        warning: { total: 0, active: 0 },
        info: { total: 0, active: 0 },
        emergency: { total: 0, active: 0 },
        total: 0,
        activeTotal: 0
      };

      stats.forEach(stat => {
        if (result[stat._id]) {
          result[stat._id].total = stat.count;
          result[stat._id].active = stat.active;
          result.total += stat.count;
          result.activeTotal += stat.active;
        }
      });

      stats = result;
      await cache.set(cacheKey, stats, 60);
    }

    return stats;
  }

  // Clean up old resolved alerts
  async cleanupOldAlerts(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    const result = await Alert.deleteMany({
      status: { $in: ['resolved', 'ignored'] },
      updatedAt: { $lt: cutoffDate }
    });
    logger.info(`Cleaned up ${result.deletedCount} old alerts`);
    return result.deletedCount;
  }
}

module.exports = new AlertService();
