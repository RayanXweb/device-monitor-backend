const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { auth } = require('../middleware/auth');

router.get('/devices', auth, reportController.generateDeviceReport);
router.get('/commands', auth, reportController.generateCommandReport);
router.get('/alerts', auth, reportController.generateAlertReport);
router.get('/locations', auth, reportController.generateLocationReport);
router.get('/keylogs', auth, reportController.generateKeylogReport);
router.get('/audit', auth, reportController.generateAuditReport);

module.exports = router;
