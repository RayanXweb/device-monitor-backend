const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

router.get('/', healthController.getHealth);
router.get('/readiness', healthController.getReadiness);
router.get('/liveness', healthController.getLiveness);
router.get('/metrics', healthController.getMetrics);

module.exports = router;
