const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'user', 'viewer'],
    default: 'user'
  },
  permissions: [{
    type: String,
    enum: [
      'manage_devices',
      'execute_commands',
      'view_reports',
      'manage_users',
      'view_logs',
      'manage_alerts',
      'manage_settings'
    ]
  }],
  devices: [{
    deviceId: { type: String, ref: 'Device' },
    activatedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    alias: String,
    notes: String
  }],
  refreshTokens: [{
    token: { type: String },
    deviceInfo: {
      userAgent: String,
      ip: String,
      deviceName: String
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
  }],
  sessionTokens: [{
    token: { type: String },
    csrfToken: { type: String },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    lastUsed: Date
  }],
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: String,
  mfaBackupCodes: [String],
  lastLogin: Date,
  lastLoginIP: String,
  lastLoginDevice: String,
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  apiKeys: [{
    key: { type: String },
    name: String,
    permissions: [String],
    lastUsed: Date,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
  }],
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'dark' },
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      alerts: { type: Boolean, default: true },
      commands: { type: Boolean, default: true }
    },
    dashboard: {
      defaultView: { type: String, default: 'grid' },
      widgets: [String],
      refreshInterval: { type: Number, default: 30 }
    }
  },
  auditLog: [{
    action: String,
    resource: String,
    resourceId: String,
    details: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'devices.deviceId': 1 });
userSchema.index({ createdAt: -1 });

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if password changed after JWT issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return verificationToken;
};

// Generate API key
userSchema.methods.generateAPIKey = function(name, permissions) {
  const apiKey = crypto.randomBytes(32).toString('hex');
  this.apiKeys.push({
    key: apiKey,
    name,
    permissions,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
  });
  return apiKey;
};

// Add audit log
userSchema.methods.addAuditLog = function(action, resource, resourceId, details, req) {
  this.auditLog.push({
    action,
    resource,
    resourceId,
    details,
    ip: req?.ip,
    userAgent: req?.headers['user-agent'],
    timestamp: new Date()
  });
  
  // Keep only last 1000 logs
  if (this.auditLog.length > 1000) {
    this.auditLog = this.auditLog.slice(-1000);
  }
};

// Virtual for device count
userSchema.virtual('deviceCount').get(function() {
  return this.devices.filter(d => d.isActive).length;
});

// Virtual for active devices
userSchema.virtual('activeDevices').get(function() {
  return this.devices.filter(d => d.isActive);
});

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByApiKey = function(apiKey) {
  return this.findOne({ 'apiKeys.key': apiKey });
};

module.exports = mongoose.model('User', userSchema);
