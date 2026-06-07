const User = require('../models/User');
const { logger } = require('../utils/logger');

const auditLog = (action, resource) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Store original end function
    const originalEnd = res.end;
    
    // Override end function
    res.end = function(...args) {
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;
      
      // Log audit entry if user is authenticated
      if (req.user) {
        const auditEntry = {
          action,
          resource,
          resourceId: req.params.id || req.body.id,
          details: {
            method: req.method,
            url: req.url,
            statusCode,
            duration,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
          },
          timestamp: new Date()
        };
        
        // Add to user's audit log
        User.findByIdAndUpdate(req.user._id, {
          $push: { auditLog: auditEntry }
        }).catch(error => {
          logger.error('Failed to save audit log:', error);
        });
        
        // Also log to file
        logger.info('Audit:', auditEntry);
      }
      
      originalEnd.apply(this, args);
    };
    
    next();
  };
};

// Sanitize sensitive data from body
const sanitizeBody = (body) => {
  if (!body) return null;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'pin', 'pinCode'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};

module.exports = { auditLog };
