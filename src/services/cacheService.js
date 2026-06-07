const redisClient = require('../config/redis');
const { logger } = require('../utils/logger');

class CacheService {
  constructor() {
    this.client = redisClient;
    this.defaultTTL = 3600; // 1 hour
  }
  
  async get(key) {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttl);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }
  
  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }
  
  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }
  
  async expire(key, seconds) {
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }
  
  async increment(key, by = 1) {
    try {
      return await this.client.incrby(key, by);
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  }
  
  async getOrSet(key, fn, ttl = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== null) return cached;
    
    const fresh = await fn();
    if (fresh !== null) {
      await this.set(key, fresh, ttl);
    }
    return fresh;
  }
  
  async flush() {
    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }
  
  // Rate limiting
  async isRateLimited(key, limit, windowSeconds) {
    const current = await this.increment(key);
    if (current === 1) {
      await this.expire(key, windowSeconds);
    }
    return current > limit;
  }
  
  // Session management
  async setSession(sessionId, data, ttl = 86400) {
    return this.set(`session:${sessionId}`, data, ttl);
  }
  
  async getSession(sessionId) {
    return this.get(`session:${sessionId}`);
  }
  
  async deleteSession(sessionId) {
    return this.del(`session:${sessionId}`);
  }
  
  // Blacklist token
  async blacklistToken(token, expiresIn) {
    return this.set(`blacklist:${token}`, 'true', expiresIn);
  }
  
  async isTokenBlacklisted(token) {
    return this.exists(`blacklist:${token}`);
  }
  
  // Device online status
  async setDeviceOnline(deviceId, ttl = 60) {
    return this.set(`device:online:${deviceId}`, 'true', ttl);
  }
  
  async isDeviceOnline(deviceId) {
    return this.exists(`device:online:${deviceId}`);
  }
  
  // User online status
  async setUserOnline(userId, ttl = 60) {
    return this.set(`user:online:${userId}`, 'true', ttl);
  }
  
  async isUserOnline(userId) {
    return this.exists(`user:online:${userId}`);
  }
}

module.exports = new CacheService();
