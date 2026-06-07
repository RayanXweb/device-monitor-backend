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

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  path: process.env.WS_PATH || '/socket.io',
  transports: ['websocket', 'polling'],
  pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 20000
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
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Device-Id']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800 },
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));
app.use(morgan('combined', { stream }));
app.use(sessionMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// Specific rate limiter for auth routes
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS_LOGIN) || 300000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_LOGIN) || 5,
  skipSuccessfulRequests: true,
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('../package.json').version,
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.status === 'ready' ? 'connected' : 'disconnected'
    }
  });
});

// API Routes
const apiPrefix = process.env.API_PREFIX || '/api';
const apiVersion = process.env.API_VERSION || 'v1';
const baseUrl = `${apiPrefix}/${apiVersion}`;

// Public routes
app.use(`${baseUrl}/auth`, authLimiter, authRoutes);
app.use(`${baseUrl}/webhooks`, webhookRoutes);

// Protected routes
app.use(`${baseUrl}/devices`, deviceRoutes);
app.use(`${baseUrl}/commands`, commandRoutes);
app.use(`${baseUrl}/surveillance`, surveillanceRoutes);
app.use(`${baseUrl}/location`, locationRoutes);
app.use(`${baseUrl}/files`, fileRoutes);
app.use(`${baseUrl}/messages`, messageRoutes);
app.use(`${baseUrl}/alerts`, alertRoutes);
app.use(`${baseUrl}/dashboard`, dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use(errorHandler);

// Make io accessible to routes
app.set('io', io);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing connections...');
  
  server.close(async () => {
    logger.info('HTTP server closed');
    
    await redisClient.quit();
    logger.info('Redis connection closed');
    
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

// Start server
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║     🚀 DEVICE MONITOR BACKEND SERVER STARTED                 ║
    ║                                                              ║
    ║     📡 Port: ${PORT}                                            ║
    ║     🌍 Environment: ${process.env.NODE_ENV}                        ║
    ║     🔗 API URL: http://${HOST}:${PORT}${baseUrl}               ║
    ║     🔌 WebSocket: ws://${HOST}:${PORT}${process.env.WS_PATH}    ║
    ║     📊 Health: http://${HOST}:${PORT}/health                    ║
    ║                                                              ║
    ║     ✅ Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
    ║     ✅ Redis: ${redisClient.status === 'ready' ? 'Connected' : 'Disconnected'}
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
