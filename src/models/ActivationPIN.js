const mongoose = require('mongoose');

const activationPINSchema = new mongoose.Schema({
  pinCode: {
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
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  status: {
    type: String,
    enum: ['active', 'used', 'expired', 'blocked'],
    default: 'active'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  usedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
activationPINSchema.index({ expiresAt: 1 });
activationPINSchema.index({ deviceId: 1, status: 1 });

// Methods
activationPINSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

activationPINSchema.methods.isBlocked = function() {
  return this.attempts >= this.maxAttempts;
};

activationPINSchema.methods.incrementAttempts = async function() {
  this.attempts += 1;
  if (this.attempts >= this.maxAttempts) {
    this.status = 'blocked';
  }
  return this.save();
};

activationPINSchema.methods.use = async function() {
  this.status = 'used';
  this.usedAt = new Date();
  return this.save();
};

// Static methods
activationPINSchema.statics.createPIN = async function(deviceId, userId, expiresInMinutes = 5) {
  const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  
  const pin = new this({
    pinCode,
    deviceId,
    userId,
    expiresAt
  });
  
  await pin.save();
  return pin;
};

activationPINSchema.statics.verifyPIN = async function(deviceId, pinCode) {
  const pin = await this.findOne({ deviceId, pinCode, status: 'active' });
  
  if (!pin) {
    return { valid: false, error: 'Invalid PIN' };
  }
  
  if (pin.isExpired()) {
    pin.status = 'expired';
    await pin.save();
    return { valid: false, error: 'PIN has expired' };
  }
  
  if (pin.isBlocked()) {
    return { valid: false, error: 'PIN has been blocked due to too many attempts' };
  }
  
  return { valid: true, pin };
};

module.exports = mongoose.model('ActivationPIN', activationPINSchema);
