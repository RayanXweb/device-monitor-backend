const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  commandId: {
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
    required: true,
    index: true
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'processing', 'completed', 'failed', 'cancelled', 'expired'],
    default: 'pending',
    index: true
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  sentAt: Date,
  executedAt: Date,
  completedAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  }
}, {
  timestamps: true
});

// Indexes
commandSchema.index({ deviceId: 1, status: 1 });
commandSchema.index({ userId: 1, createdAt: -1 });
commandSchema.index({ status: 1, expiresAt: 1 });

// Methods
commandSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

commandSchema.methods.canRetry = function() {
  return this.retryCount < this.maxRetries && this.status === 'failed';
};

// Static methods
commandSchema.statics.getPendingCommands = function(deviceId) {
  return this.find({
    deviceId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: 1 });
};

commandSchema.statics.getCommandStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $group: {
      _id: '$status',
      count: { $sum: 1 }
    }}
  ]);
  
  const result = {
    pending: 0,
    sent: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });
  
  return result;
};

module.exports = mongoose.model('Command', commandSchema);
