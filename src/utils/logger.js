const winston = require('winston');
const path = require('path');

const logDir = process.env.LOG_DIR || 'logs';

// Custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: parseInt(process.env.LOG_MAX_SIZE) || 10485760,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: parseInt(process.env.LOG_MAX_SIZE) || 10485760,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
    })
  ]
});

// Create stream for morgan
const stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = { logger, stream };
