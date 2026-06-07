const mongoose = require('mongoose');
const crypto = require('crypto');

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  deviceName: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'blocked', 'deleted'],
    default: 'pending'
  },
  
  // Device Info
  brand: { type: String, trim: true },
  model: { type: String, trim: true },
  androidVersion: { type: String },
  country: { type: String },
  
  // Battery Info
  battery: {
    level: { type: Number, min: 0, max: 100, default: 0 },
    isCharging: { type: Boolean, default: false },
    temperature: { type: Number },
    health: { type: String },
    technology: { type: String },
    voltage: { type: Number },
    lastUpdate: { type: Date, default: Date.now }
  },
  
  // Signal Info
  signalInfo: {
    level: { type: Number, min: 0, max: 100 },
    type: { type: String },
    dBm: { type: Number },
    asu: { type: Number },
    networkType: { type: String },
    operator: { type: String },
    lastUpdate: { type: Date, default: Date.now }
  },
  
  // SIM Info
  simInfo: [{
    simSlot: { type: Number },
    carrier: { type: String },
    country: { type: String },
    phoneNumber: { type: String },
    state: { type: String },
    iccid: { type: String },
    imsi: { type: String }
  }],
  
  // System Info
  systemInfo: {
    osVersion: { type: String },
    kernelVersion: { type: String },
    buildNumber: { type: String },
    apiLevel: { type: Number },
    securityPatch: { type: String },
    uptime: { type: Number },
    bootTime: { type: Date },
    totalRAM: { type: Number },
    usedRAM: { type: Number },
    freeRAM: { type: Number },
    totalStorage: { type: Number },
    usedStorage: { type: Number },
    freeStorage: { type: Number }
  },
  
  // Location
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    speed: { type: Number },
    altitude: { type: Number },
    provider: { type: String },
    address: { type: String },
    city: { type: String },
    country: { type: String },
    postalCode: { type: String },
    timestamp: { type: Date, default: Date.now },
    isRealtime: { type: Boolean, default: false }
  },
  
  locationHistory: [{
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    speed: Number,
    altitude: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Security
  security: {
    isBlocked: { type: Boolean, default: false },
    blockedReason: String,
    blockedAt: Date,
    lastSecurityEvent: Date,
    suspiciousActivities: [{
      type: String,
      description: String,
      timestamp: Date,
      ip: String
    }]
  },
  
  antiUninstall: {
    enabled: { type: Boolean, default: false },
    protected: { type: Boolean, default: true },
    lastCheck: { type: Date }
  },
  
  // Activation
  activationStatus: {
    pinCode: String,
    pinExpiresAt: Date,
    pinAttempts: { type: Number, default: 0 },
    activatedAt: Date,
    activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Tokens
  tokens: {
    accessToken: String,
    refreshToken: String,
    tokenExpiresAt: Date,
    fcmToken: String,
    socketId: String
  },
  
  // Heartbeat
  heartbeat: {
    lastSeen: { type: Date, default: Date.now },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    latency: Number,
    appVersion: String
  },
  
  // Alert Thresholds
  alertThresholds: {
    cpu: { type: Number, default: 80 },
    memory: { type: Number, default: 85 },
    battery: { type: Number, default: 20 },
    signal: { type: Number, default: 30 },
    disk: { type: Number, default: 90 }
  },
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ userId: 1, status: 1 });
deviceSchema.index({ status: 1, 'heartbeat.lastSeen': -1 });
deviceSchema.index({ 'location.timestamp': -1 });
deviceSchema.index({ createdAt: -1 });

// Virtuals
deviceSchema.virtual('isOnline').get(function() {
  const timeout = parseInt(process.env.DEVICE_OFFLINE_THRESHOLD) || 180000;
  const lastSeen = new Date(this.heartbeat.lastSeen).getTime();
  const now = Date.now();
  return this.status === 'active' && (now - lastSeen) < timeout;
});

deviceSchema.virtual('uptimeHours').get(function() {
  return this.systemInfo.uptime ? (this.systemInfo.uptime / 3600).toFixed(2) : 0;
});

// Methods
deviceSchema.methods.updateHeartbeat = function(data) {
  this.heartbeat = {
    lastSeen: new Date(),
    status: 'online',
    latency: data.latency || 0,
    appVersion: data.appVersion || this.heartbeat?.appVersion
  };
  
  if (data.battery) {
    this.battery = {
      ...this.battery,
      level: data.battery.level,
      isCharging: data.battery.isCharging,
      temperature: data.battery.temperature,
      lastUpdate: new Date()
    };
  }
  
  if (data.signal) {
    this.signalInfo = {
      ...this.signalInfo,
      level: data.signal.level,
      type: data.signal.type,
      dBm: data.signal.dBm,
      networkType: data.signal.networkType,
      operator: data.signal.operator,
      lastUpdate: new Date()
    };
  }
  
  if (this.status === 'inactive') {
    this.status = 'active';
  }
  
  return this.save();
};

deviceSchema.methods.updateLocation = function(locationData) {
  this.location = {
    ...locationData,
    timestamp: new Date(),
    isRealtime: true
  };
  
  this.locationHistory.push({
    latitude: locationData.latitude,
    longitude: locationData.longitude,
    accuracy: locationData.accuracy,
    speed: locationData.speed,
    altitude: locationData.altitude,
    timestamp: new Date()
  });
  
  // Keep last 1000 locations
  if (this.locationHistory.length > 1000) {
    this.locationHistory = this.locationHistory.slice(-1000);
  }
  
  return this.save();
};

deviceSchema.methods.isActive = function() {
  return this.status === 'active' && !this.security.isBlocked;
};

module.exports = mongoose.model('Device', deviceSchema);
