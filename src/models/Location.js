const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  locationId: {
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
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    default: null
  },
  speed: {
    type: Number,
    default: null
  },
  altitude: {
    type: Number,
    default: null
  },
  provider: {
    type: String,
    default: 'gps'
  },
  address: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  },
  postalCode: {
    type: String,
    default: null
  },
  isRealtime: {
    type: Boolean,
    default: true
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
locationSchema.index({ deviceId: 1, timestamp: -1 });
locationSchema.index({ userId: 1, timestamp: -1 });
locationSchema.index({ latitude: 1, longitude: 1 });

// Methods
locationSchema.methods.getDistanceTo = function(lat, lng) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat - this.latitude) * Math.PI / 180;
  const dLng = (lng - this.longitude) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Static methods
locationSchema.statics.getLocationsByDevice = async function(deviceId, limit = 100, page = 1, options = {}) {
  const skip = (page - 1) * limit;
  const query = { deviceId };
  
  if (options.startDate) {
    query.timestamp = { ...query.timestamp, $gte: new Date(options.startDate) };
  }
  if (options.endDate) {
    query.timestamp = { ...query.timestamp, $lte: new Date(options.endDate) };
  }
  
  const locations = await this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);
  
  const total = await this.countDocuments(query);
  
  return {
    locations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

locationSchema.statics.getLastLocation = async function(deviceId) {
  return this.findOne({ deviceId }).sort({ timestamp: -1 });
};

locationSchema.statics.getLocationStats = async function(deviceId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    { $match: { deviceId, timestamp: { $gte: since } } },
    { $group: {
      _id: null,
      totalPoints: { $sum: 1 },
      avgAccuracy: { $avg: '$accuracy' },
      avgSpeed: { $avg: '$speed' },
      minLat: { $min: '$latitude' },
      maxLat: { $max: '$latitude' },
      minLng: { $min: '$longitude' },
      maxLng: { $max: '$longitude' }
    }}
  ]);
  
  return stats[0] || { totalPoints: 0, avgAccuracy: 0, avgSpeed: 0 };
};

locationSchema.statics.deleteOldLocations = async function(daysToKeep = 30) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const result = await this.deleteMany({ timestamp: { $lt: cutoffDate } });
  return result.deletedCount;
};

module.exports = mongoose.model('Location', locationSchema);
