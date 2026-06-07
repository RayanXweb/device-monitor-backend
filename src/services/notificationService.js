const admin = require('firebase-admin');
const { sendEmail } = require('./emailService');
const { logger } = require('../utils/logger');
const Notification = require('../models/Notification');
const User = require('../models/User');
const axios = require('axios');

class NotificationService {
  constructor() {
    // Initialize Firebase if credentials exist
    if (process.env.FIREBASE_PROJECT_ID) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL
          })
        });
        this.messaging = admin.messaging();
        logger.info('Firebase initialized for push notifications');
      } catch (error) {
        logger.error('Firebase initialization error:', error);
      }
    }
  }

  // Send push notification via FCM
  async sendPushNotification(deviceToken, title, body, data = {}) {
    try {
      if (!this.messaging) {
        logger.warn('Firebase not configured, skipping push notification');
        return null;
      }

      const message = {
        token: deviceToken,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          timestamp: new Date().toISOString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'device_monitor'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await this.messaging.send(message);
      logger.info(`Push notification sent: ${response}`);
      return response;
    } catch (error) {
      logger.error('Push notification error:', error);
      return null;
    }
  }

  // Send push notification to user's all devices
  async sendPushToUser(userId, title, body, data = {}) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        return null;
      }

      const results = [];
      for (const token of user.fcmTokens) {
        const result = await this.sendPushNotification(token, title, body, data);
        results.push(result);
      }
      return results;
    } catch (error) {
      logger.error('Send push to user error:', error);
      return null;
    }
  }

  // Send email notification
  async sendEmailNotification(userId, subject, template, data) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        return null;
      }

      const result = await sendEmail({
        to: user.email,
        subject,
        template,
        data: { ...data, name: user.name }
      });
      return result;
    } catch (error) {
      logger.error('Email notification error:', error);
      return null;
    }
  }

  // Send SMS via Twilio
  async sendSMS(phoneNumber, message) {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID) {
        logger.warn('Twilio not configured');
        return null;
      }

      const twilio = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const result = await twilio.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      logger.info(`SMS sent to ${phoneNumber}: ${result.sid}`);
      return result;
    } catch (error) {
      logger.error('SMS notification error:', error);
      return null;
    }
  }

  // Send webhook notification
  async sendWebhook(url, data, secret = null) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'DeviceMonitor/1.0'
      };

      if (secret) {
        headers['X-Webhook-Secret'] = secret;
      }

      const response = await axios.post(url, data, { headers });
      logger.info(`Webhook sent to ${url}: ${response.status}`);
      return response.data;
    } catch (error) {
      logger.error('Webhook notification error:', error);
      return null;
    }
  }

  // Create and send notification
  async sendNotification(userId, type, title, message, data = {}, channels = ['push']) {
    try {
      // Save to database
      const notification = new Notification({
        notificationId: require('uuid').v4(),
        userId,
        type,
        title,
        message,
        data,
        channels,
        status: 'pending'
      });
      await notification.save();

      // Get user preferences
      const user = await User.findById(userId);
      if (!user) {
        notification.status = 'failed';
        notification.error = 'User not found';
        await notification.save();
        return null;
      }

      const results = [];

      // Send via push notification
      if (channels.includes('push') && user.preferences?.notifications?.push !== false) {
        const pushResult = await this.sendPushToUser(userId, title, message, data);
        results.push({ channel: 'push', result: pushResult });
      }

      // Send via email
      if (channels.includes('email') && user.preferences?.notifications?.email !== false) {
        const emailResult = await this.sendEmailNotification(userId, title, null, { message });
        results.push({ channel: 'email', result: emailResult });
      }

      // Send via SMS
      if (channels.includes('sms') && user.phone) {
        const smsResult = await this.sendSMS(user.phone, `${title}: ${message}`);
        results.push({ channel: 'sms', result: smsResult });
      }

      // Update notification status
      notification.status = 'sent';
      notification.sentAt = new Date();
      await notification.save();

      return { notification, results };
    } catch (error) {
      logger.error('Send notification error:', error);
      return null;
    }
  }

  // Send alert notification
  async sendAlertNotification(alert, userId) {
    const channels = ['push', 'email'];
    
    // Send critical alerts via SMS as well
    if (alert.severity === 'critical' || alert.severity === 'emergency') {
      channels.push('sms');
    }

    return this.sendNotification(
      userId,
      'alert',
      alert.title,
      alert.message,
      { alertId: alert.alertId, deviceId: alert.deviceId },
      channels
    );
  }

  // Send command result notification
  async sendCommandResultNotification(command, userId) {
    const status = command.status === 'completed' ? '✅ Completed' : '❌ Failed';
    const message = `Command ${command.type} ${command.status === 'completed' ? 'completed successfully' : 'failed'}`;

    return this.sendNotification(
      userId,
      'command',
      `${status}: ${command.type}`,
      message,
      { commandId: command.commandId, deviceId: command.deviceId },
      ['push']
    );
  }

  // Send device status notification
  async sendDeviceStatusNotification(deviceId, deviceName, status, userId) {
    const message = status === 'online' 
      ? `${deviceName} is now online`
      : `${deviceName} went offline`;

    return this.sendNotification(
      userId,
      'device',
      `Device ${status === 'online' ? 'Online' : 'Offline'}`,
      message,
      { deviceId },
      ['push', 'email']
    );
  }
}

module.exports = new NotificationService();
