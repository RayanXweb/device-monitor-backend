const mongoose = require('mongoose');

const commandResponseSchema = new mongoose.Schema({
  commandId: {
    type: String,
    ref: 'Command',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    ref: 'Device',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['completed', 'failed', 'processing'],
    required: true
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  responseTime: Number // in milliseconds
}, {
  timestamps: true
});

// Indexes
commandResponseSchema.index({ commandId: 1 });
commandResponseSchema.index({ deviceId: 1, receivedAt: -1 });
commandResponseSchema.index({ createdAt: -1 });

// Static methods
commandResponseSchema.statics.getAverageResponseTime = async function(deviceId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const result = await this.aggregate([
    { $match: { deviceId, receivedAt: { $gte: since }, responseTime: { $exists: true } } },
    { $group: {
      _id: null,
      avgResponseTime: { $avg: '$responseTime' },
      totalCommands: { $sum: 1 },
      successRate: {
        $avg: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
      }
    }}
  ]);
  
  return result[0] || { avgResponseTime: 0, totalCommands: 0, successRate: 0 };
};

module.exports = mongoose.model('CommandResponse', commandResponseSchema);
