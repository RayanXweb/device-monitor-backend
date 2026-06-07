const crypto = require('crypto');
const { logger } = require('../utils/logger');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.secretKey = process.env.AES_SECRET_KEY || crypto.randomBytes(32).toString('hex');
    this.iv = process.env.AES_IV || crypto.randomBytes(16).toString('hex');
  }

  // Encrypt data
  encrypt(text) {
    try {
      const cipher = crypto.createCipheriv(
        this.algorithm,
        Buffer.from(this.secretKey, 'hex'),
        Buffer.from(this.iv, 'hex')
      );
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      logger.error('Encryption error:', error);
      return null;
    }
  }

  // Decrypt data
  decrypt(encryptedText) {
    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.secretKey, 'hex'),
        Buffer.from(this.iv, 'hex')
      );
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      return null;
    }
  }

  // Hash data with salt
  hash(data, salt = null) {
    try {
      const useSalt = salt || crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(data, useSalt, 10000, 64, 'sha512').toString('hex');
      return { hash, salt: useSalt };
    } catch (error) {
      logger.error('Hash error:', error);
      return null;
    }
  }

  // Verify hash
  verifyHash(data, hash, salt) {
    try {
      const { hash: newHash } = this.hash(data, salt);
      return newHash === hash;
    } catch (error) {
      logger.error('Verify hash error:', error);
      return false;
    }
  }

  // Generate random token
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate API key
  generateApiKey() {
    return `dm_${crypto.randomBytes(24).toString('hex')}`;
  }

  // Mask sensitive data
  maskSensitiveData(data, visibleStart = 4, visibleEnd = 4) {
    if (!data) return '***';
    const str = data.toString();
    if (str.length <= visibleStart + visibleEnd) return '*'.repeat(str.length);
    const start = str.slice(0, visibleStart);
    const end = str.slice(-visibleEnd);
    const middle = '*'.repeat(str.length - visibleStart - visibleEnd);
    return `${start}${middle}${end}`;
  }

  // Encrypt object
  encryptObject(obj) {
    try {
      const jsonStr = JSON.stringify(obj);
      const encrypted = this.encrypt(jsonStr);
      return encrypted;
    } catch (error) {
      logger.error('Encrypt object error:', error);
      return null;
    }
  }

  // Decrypt object
  decryptObject(encrypted) {
    try {
      const decrypted = this.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Decrypt object error:', error);
      return null;
    }
  }

  // Sign data with HMAC
  sign(data, secret = process.env.JWT_SECRET) {
    return crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
  }

  // Verify signature
  verifySignature(data, signature, secret = process.env.JWT_SECRET) {
    const expectedSignature = this.sign(data, secret);
    return expectedSignature === signature;
  }
}

module.exports = new EncryptionService();
