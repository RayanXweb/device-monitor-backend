const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService');
const { cache } = require('../config/redis');
const { logger } = require('../utils/logger');

// Generate JWT tokens
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
  
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Register new user
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
    }
    
    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'user'
    });
    
    await user.save();
    
    // Generate email verification token
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    
    // Send verification email
    await sendEmail({
      to: user.email,
      subject: 'Verify your email',
      template: 'email-verification',
      data: {
        name: user.name,
        verificationUrl: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
      }
    });
    
    // Add audit log
    user.addAuditLog('REGISTER', 'User', user._id, { email: user.email }, req);
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      data: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockedUntil - Date.now()) / 1000 / 60);
      return res.status(401).json({
        success: false,
        error: `Account is locked. Please try again in ${remainingTime} minutes`
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      user.failedLoginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
      }
      
      await user.save();
      
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.lastLoginDevice = req.headers['user-agent'];
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);
    
    // Store refresh token
    user.refreshTokens.push({
      token: refreshToken,
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        deviceName: req.body.deviceName || 'Unknown'
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    // Add audit log
    user.addAuditLog('LOGIN', 'User', user._id, { email: user.email }, req);
    await user.save();
    
    // Remove sensitive data
    const userData = user.toObject();
    delete userData.password;
    delete userData.refreshTokens;
    delete userData.sessionTokens;
    
    res.json({
      success: true,
      data: {
        user: userData,
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required'
      });
    }
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
    
    // Find user with this refresh token
    const user = await User.findOne({
      _id: decoded.id,
      'refreshTokens.token': refreshToken,
      'refreshTokens.expiresAt': { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    // Remove old refresh token and add new one
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    user.refreshTokens.push({
      token: newRefreshToken,
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        deviceName: req.body.deviceName || 'Unknown'
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    await user.save();
    
    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = req.user;
    
    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    }
    
    // Add audit log
    user.addAuditLog('LOGOUT', 'User', user._id, {}, req);
    await user.save();
    
    // Blacklist access token
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.decode(token);
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiresIn > 0) {
        await cache.set(`blacklist_${token}`, 'true', expiresIn);
      }
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshTokens -sessionTokens -apiKeys');
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal that user doesn't exist for security
      return res.json({
        success: true,
        message: 'If your email is registered, you will receive a reset link'
      });
    }
    
    const resetToken = user.generatePasswordResetToken();
    await user.save();
    
    // Send reset email
    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'password-reset',
      data: {
        name: user.name,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      }
    });
    
    res.json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }
    
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    
    // Clear all refresh tokens
    user.refreshTokens = [];
    
    await user.save();
    
    // Add audit log
    user.addAuditLog('PASSWORD_RESET', 'User', user._id, {}, req);
    await user.save();
    
    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;
    
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    
    // Clear all refresh tokens except current
    const currentRefreshToken = req.body.refreshToken;
    user.refreshTokens = user.refreshTokens.filter(t => t.token === currentRefreshToken);
    
    await user.save();
    
    // Add audit log
    user.addAuditLog('CHANGE_PASSWORD', 'User', user._id, {}, req);
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token'
      });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    await user.save();
    
    // Add audit log
    user.addAuditLog('EMAIL_VERIFIED', 'User', user._id, {}, req);
    await user.save();
    
    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyEmail
};
