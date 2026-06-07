const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Email templates
const templates = {
  'welcome': (data) => ({
    subject: `Welcome to ${process.env.APP_NAME}`,
    html: `
      <h1>Welcome ${data.name}!</h1>
      <p>Thank you for registering with ${process.env.APP_NAME}.</p>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${data.verificationUrl}">Verify Email</a>
    `
  }),
  'password-reset': (data) => ({
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${data.resetUrl}">Reset Password</a>
      <p>This link will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
  }),
  'device-activated': (data) => ({
    subject: 'Device Activated',
    html: `
      <h1>Device Activated</h1>
      <p>Your device "${data.deviceName}" has been successfully activated.</p>
      <p>You can now start monitoring your device.</p>
    `
  }),
  'alert': (data) => ({
    subject: `[${data.severity.toUpperCase()}] ${data.title}`,
    html: `
      <h1>Alert: ${data.title}</h1>
      <p><strong>Device:</strong> ${data.deviceName}</p>
      <p><strong>Severity:</strong> ${data.severity}</p>
      <p><strong>Message:</strong> ${data.message}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <a href="${data.alertUrl}">View Alert</a>
    `
  })
};

// Send email
const sendEmail = async ({ to, subject, html, template, data }) => {
  try {
    let emailSubject = subject;
    let emailHtml = html;
    
    if (template && templates[template]) {
      const templateData = templates[template](data);
      emailSubject = templateData.subject;
      emailHtml = templateData.html;
    }
    
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
      to,
      subject: emailSubject,
      html: emailHtml
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email sending error:', error);
    throw error;
  }
};

// Send bulk emails
const sendBulkEmails = async (recipients, template, data) => {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient.email,
        template,
        data: { ...data, name: recipient.name }
      });
      results.push({ email: recipient.email, success: true, messageId: result.messageId });
    } catch (error) {
      results.push({ email: recipient.email, success: false, error: error.message });
    }
  }
  
  return results;
};

module.exports = {
  sendEmail,
  sendBulkEmails
};
