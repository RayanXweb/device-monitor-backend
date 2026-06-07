const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.get('/stats', auth, dashboardController.getStats);
router.get('/activity', auth, dashboardController.getRecentActivity);
router.get('/analytics', auth, dashboardController.getDeviceAnalytics);
router.get('/health', auth, dashboardController.getSystemHealth);

module.exports = router;
