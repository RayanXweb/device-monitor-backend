const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const settingsController = require('../controllers/settingsController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const updateSettingsValidation = [
  body('theme').optional().isIn(['light', 'dark', 'auto']),
  body('language').optional().isString().isLength({ min: 2, max: 5 }),
  body('timezone').optional().isString()
];

const generateApiKeyValidation = [
  body('name').optional().isString().isLength({ min: 3, max: 50 }),
  body('permissions').optional().isArray()
];

// User settings
router.get('/user', auth, settingsController.getUserSettings);
router.put('/user', auth, updateSettingsValidation, validate, settingsController.updateUserSettings);

// Device settings
router.get('/device/:deviceId', auth, settingsController.getDeviceSettings);
router.put('/device/:deviceId', auth, settingsController.updateDeviceSettings);

// Notification settings
router.get('/notifications', auth, settingsController.getNotificationSettings);
router.put('/notifications', auth, settingsController.updateNotificationSettings);

// API Keys
router.get('/api-keys', auth, settingsController.getApiKeys);
router.post('/api-keys', auth, generateApiKeyValidation, validate, settingsController.generateApiKey);
router.delete('/api-keys/:keyId', auth, settingsController.revokeApiKey);

module.exports = router;
