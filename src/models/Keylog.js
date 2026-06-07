const mongoose = require('mongoose');

const keylogSchema = new mongoose.Schema({
  keylogId: {
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
  text: {
    type: String,
    required: true
  },
  app: {
    type: String,
    default: 'Unknown'
  },
  packageName: {
    type: String,
    default: null
  },
  isSensitive: {
    type: Boolean,
    default: false,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
keylogSchema.index({ deviceId: 1, timestamp: -1 });
keylogSchema.index({ userId: 1, timestamp: -1 });
keylogSchema.index({ isSensitive: 1, timestamp: -1 });

// Static methods
keylogSchema.statics.getKeylogsByDevice = async function(deviceId, limit = 100, page = 1, options = {}) {
  const skip = (page - 1) * limit;
  const query = { deviceId };
  
  if (options.startDate) {
    query.timestamp = { ...query.timestamp, $gte: new Date(options.startDate) };
  }
  if (options.endDate) {
    query.timestamp = { ...query.timestamp, $lte: new Date(options.endDate) };
  }
  if (options.sensitiveOnly) {
    query.isSensitive = true;
  }
  if (options.app) {
    query.app = options.app;
  }
  
  const logs = await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await this.countDocuments(query);
  
  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

keylogSchema.statics.getSensitiveKeylogs = async function(deviceId) {
  return this.find({ deviceId, isSensitive: true })
    .sort({ timestamp: -1 })
    .limit(100);
};

keylogSchema.statics.deleteOldKeylogs = async function(daysToKeep = 30) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const result = await this.deleteMany({ timestamp: { $lt: cutoffDate } });
  return result.deletedCount;
};

module.exports = mongoose.model('Keylog', keylogSchema);
