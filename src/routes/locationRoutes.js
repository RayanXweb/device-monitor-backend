const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const locationController = require('../controllers/locationController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

// Validation rules
const updateLocationValidation = [
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('accuracy').optional().isFloat().withMessage('Invalid accuracy'),
  body('speed').optional().isFloat().withMessage('Invalid speed'),
  body('altitude').optional().isFloat().withMessage('Invalid altitude')
];

// Routes
router.get('/:deviceId/current', auth, locationController.getCurrentLocation);
router.post('/:deviceId/update', updateLocationValidation, validate, locationController.updateLocation);
router.get('/:deviceId/history', auth, locationController.getLocationHistory);
router.post('/:deviceId/request', auth, locationController.requestLocation);
router.get('/:deviceId/stats', auth, locationController.getLocationStats);

module.exports = router;
