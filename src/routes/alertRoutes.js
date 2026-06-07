const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { auth } = require('../middleware/auth');

router.get('/', auth, alertController.getAlerts);
router.get('/active', auth, alertController.getActiveAlerts);
router.get('/stats', auth, alertController.getAlertStats);
router.get('/:id', auth, alertController.getAlert);
router.post('/:id/acknowledge', auth, alertController.acknowledgeAlert);
router.post('/:id/resolve', auth, alertController.resolveAlert);
router.delete('/:id', auth, alertController.deleteAlert);

module.exports = router;
