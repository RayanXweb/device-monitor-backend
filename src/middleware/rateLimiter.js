const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisClient = require('../config/redis');

// General rate limiter
const generalLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:general:'
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:'
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS_LOGIN) || 300000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_LOGIN) || 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// API rate limiter
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:api:'
  }),
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS_API) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_API) || 50,
  message: {
    success: false,
    error: 'Too many API requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?._id || req.ip;
  }
});

// WebSocket rate limiter
const wsLimiter = (maxConnections = 5) => {
  const connections = new Map();
  
  return (socket, next) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    if (!connections.has(ip)) {
      connections.set(ip, []);
    }
    
    const userConnections = connections.get(ip).filter(time => now - time < windowMs);
    
    if (userConnections.length >= maxConnections) {
      return next(new Error('Too many WebSocket connections'));
    }
    
    userConnections.push(now);
    connections.set(ip, userConnections);
    next();
  };
};

module.exports = {
  generalLimiter,
  authLimiter,
  apiLimiter,
  wsLimiter
};
