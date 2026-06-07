const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const fileUpload = require('express-fileupload');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config();

// Import modules
const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const { setupWebSocket } = require('./services/websocketService');
const { errorHandler } = require('./middleware/errorHandler');
const { logger, stream } = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const commandRoutes = require('./routes/commandRoutes');
const surveillanceRoutes = require('./routes/surveillanceRoutes');
const locationRoutes = require('./routes/locationRoutes');
const fileRoutes = require('./routes/fileRoutes');
const messageRoutes = require('./routes/messageRoutes');
const alertRoutes = require('./routes/alertRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const healthRoutes = require('./routes/healthRoutes');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Device-Id']
  },
  path: process.env.WS_PATH || '/socket.io',
  transports: ['websocket', 'polling'],
  pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 20000,
  allowEIO3: true,
  cors: {
    origin: true,
    credentials: true
  }
});

// Connect to Database
connectDB();

// Setup WebSocket
setupWebSocket(io);

// Session middleware
const sessionMiddleware = session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: 'lax'
  },
  name: 'sessionId'
});

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Device-Id', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ limit: '50mb' }));

// File upload
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true,
  safeFileNames: true,
  preserveExtension: true,
  debug: process.env.NODE_ENV === 'development'
}));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/temp', express.static(path.join(__dirname, '../temp')));

// Logging
app.use(morgan('combined', { stream }));
app.use(morgan('dev', { stream }));

// Session
app.use(sessionMiddleware);

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = require('crypto').randomBytes(16).toString('hex');
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// ============================================
// RATE LIMITING
// ============================================

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip,
  skip: (req) => req.path === '/health'
});

// Auth rate limiter
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS_LOGIN) || 300000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_LOGIN) || 5,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// API rate limiter
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS_API) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_API) || 100,
  message: { success: false, error: 'Rate limit exceeded. Please slow down your requests.' },
  standardHeaders: true,
  legacyHeaders: false
});

// WebSocket connection limiter
const wsConnectionLimiter = new Map();

// Apply rate limiters
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/v1', apiLimiter);

// ============================================
// REQUEST LOGGING & TRACKING
// ============================================

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
    
    // Track slow requests
    if (duration > 5000) {
      logger.warn(`Slow request: ${req.method} ${req.url} took ${duration}ms`);
    }
  });
  
  next();
});

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version,
    requestId: req.requestId,
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.status === 'ready' ? 'connected' : 'disconnected'
    }
  });
});

// Readiness probe
app.get('/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const redisReady = redisClient.status === 'ready';
  
  if (dbReady && redisReady) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ 
      status: 'not ready',
      database: dbReady ? 'ready' : 'not ready',
      redis: redisReady ? 'ready' : 'not ready'
    });
  }
});

// Liveness probe
app.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = [];
    
    // Basic process metrics
    metrics.push(`# HELP nodejs_uptime_seconds Uptime of Node.js process`);
    metrics.push(`# TYPE nodejs_uptime_seconds gauge`);
    metrics.push(`nodejs_uptime_seconds ${process.uptime()}`);
    
    metrics.push(`# HELP nodejs_memory_usage_bytes Memory usage`);
    metrics.push(`# TYPE nodejs_memory_usage_bytes gauge`);
    metrics.push(`nodejs_memory_usage_bytes{type="rss"} ${process.memoryUsage().rss}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heap_total"} ${process.memoryUsage().heapTotal}`);
    metrics.push(`nodejs_memory_usage_bytes{type="heap_used"} ${process.memoryUsage().heapUsed}`);
    
    // Active handles
    metrics.push(`# HELP nodejs_active_handles Active handles count`);
    metrics.push(`# TYPE nodejs_active_handles gauge`);
    metrics.push(`nodejs_active_handles ${process._getActiveHandles().length}`);
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ROUTES
// ============================================

const apiPrefix = process.env.API_PREFIX || '/api';
const apiVersion = process.env.API_VERSION || 'v1';
const baseUrl = `${apiPrefix}/${apiVersion}`;

// Public routes (no authentication required)
app.use(`${baseUrl}/auth`, authLimiter, authRoutes);
app.use(`${baseUrl}/webhooks`, webhookRoutes);

// Health routes
app.use('/health', healthRoutes);

// Protected routes (authentication required)
app.use(`${baseUrl}/devices`, deviceRoutes);
app.use(`${baseUrl}/commands`, commandRoutes);
app.use(`${baseUrl}/surveillance`, surveillanceRoutes);
app.use(`${baseUrl}/location`, locationRoutes);
app.use(`${baseUrl}/files`, fileRoutes);
app.use(`${baseUrl}/messages`, messageRoutes);
app.use(`${baseUrl}/alerts`, alertRoutes);
app.use(`${baseUrl}/dashboard`, dashboardRoutes);
app.use(`${baseUrl}/reports`, reportRoutes);
app.use(`${baseUrl}/settings`, settingsRoutes);

// ============================================
// STATIC FILES & DOWNLOADS
// ============================================

// Serve static files for exports
app.use('/exports', express.static(path.join(__dirname, '../exports')));

// Download endpoint
app.get('/download/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const filePath = path.join(__dirname, `../exports/${type}/${filename}`);
  
  if (require('fs').existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

// Slack webhook
app.post('/webhooks/slack', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const payload = JSON.parse(req.body);
    logger.info('Slack webhook received:', payload);
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('Slack webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Discord webhook
app.post('/webhooks/discord', express.json(), (req, res) => {
  try {
    logger.info('Discord webhook received:', req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Discord webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GitHub webhook
app.post('/webhooks/github', express.json(), (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    logger.info(`GitHub webhook received: ${event}`);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('GitHub webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    requestId: req.requestId
  });
});

// Global error handler
app.use(errorHandler);

// Make io accessible to routes
app.set('io', io);
app.set('redisClient', redisClient);
app.set('sessionMiddleware', sessionMiddleware);

// ============================================
// WEBSOCKET CONNECTION MANAGEMENT
// ============================================

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.isDevice = decoded.type === 'device';
    if (socket.isDevice) {
      socket.deviceId = decoded.deviceId;
    }
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// Connection counter
let activeConnections = 0;

io.on('connection', (socket) => {
  activeConnections++;
  logger.info(`WebSocket connected: ${socket.id}, Active: ${activeConnections}`);
  
  socket.on('disconnect', () => {
    activeConnections--;
    logger.info(`WebSocket disconnected: ${socket.id}, Active: ${activeConnections}`);
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Close all WebSocket connections
    io.close(() => {
      logger.info('WebSocket server closed');
    });
    
    // Close database connections
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    } catch (error) {
      logger.error('Error closing MongoDB:', error);
    }
    
    // Close Redis connection
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis:', error);
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ============================================
// START SERVER
// ============================================

const PORT = parseInt(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`
    ╔══════════════════════════════════════════════════════════════════════════════╗
    ║                                                                              ║
    ║                    🚀 DEVICE MONITOR BACKEND SERVER STARTED                   ║
    ║                                                                              ║
    ║     📡 Port: ${PORT.toString().padEnd(46)}║
    ║     🌍 Environment: ${(process.env.NODE_ENV || 'development').padEnd(46)}║
    ║     🔗 API URL: http://${HOST}:${PORT}${baseUrl.padEnd(30)}║
    ║     🔌 WebSocket: ws://${HOST}:${PORT}${process.env.WS_PATH || '/socket.io'.padEnd(26)}║
    ║     📊 Health: http://${HOST}:${PORT}/health${' '.padEnd(41)}║
    ║                                                                              ║
    ║     ✅ Database: ${mongoose.connection.readyState === 1 ? 'Connected'.padEnd(42) : 'Disconnected'.padEnd(39)}║
    ║     ✅ Redis: ${redisClient.status === 'ready' ? 'Connected'.padEnd(46) : 'Disconnected'.padEnd(43)}║
    ║                                                                              ║
    ║     📅 Started at: ${new Date().toISOString().padEnd(44)}║
    ║     💻 Node Version: ${process.version.padEnd(44)}║
    ║                                                                              ║
    ╚══════════════════════════════════════════════════════════════════════════════╝
  `);
});

// ============================================
// EXPORTS
// ============================================

module.exports = { app, server, io };
