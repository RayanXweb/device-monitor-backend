const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook endpoints (no auth required, but should verify signatures in production)
router.post('/slack', webhookController.handleSlackWebhook);
router.post('/discord', webhookController.handleDiscordWebhook);
router.post('/github', webhookController.handleGitHubWebhook);
router.post('/generic', webhookController.handleGenericWebhook);

module.exports = router;
