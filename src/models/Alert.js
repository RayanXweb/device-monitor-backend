const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceId: {
    type: String,
    ref: 'Device',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['cpu', 'memory', 'battery', 'signal', 'offline', 'online', 'custom'],
    required: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical', 'emergency'],
    default: 'warning'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    default: null
  },
  threshold: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'ignored'],
    default: 'active'
  },
  acknowledgedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    acknowledgedAt: Date
  },
  resolvedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    resolvedAt: Date
  },
  resolvedMessage: String,
  notifications: [{
    type: { type: String, enum: ['email', 'push', 'webhook', 'sms'] },
    sentAt: { type: Date, default: Date.now },
    status: String,
    error: String
  }],
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
alertSchema.index({ deviceId: 1, createdAt: -1 });
alertSchema.index({ userId: 1, status: 1 });
alertSchema.index({ severity: 1, status: 1 });
alertSchema.index({ createdAt: -1 });

// Static methods
alertSchema.statics.getActiveAlerts = function(userId) {
  return this.find({ userId, status: 'active' }).sort('-createdAt');
};

alertSchema.statics.getAlertsByDevice = function(deviceId, limit = 50) {
  return this.find({ deviceId }).sort('-createdAt').limit(limit);
};

alertSchema.statics.getAlertStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'active' } },
    { $group: {
      _id: '$severity',
      count: { $sum: 1 }
    }}
  ]);
  
  const result = {
    critical: 0,
    warning: 0,
    info: 0,
    emergency: 0,
    total: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });
  
  return result;
};

module.exports = mongoose.model('Alert', alertSchema);
