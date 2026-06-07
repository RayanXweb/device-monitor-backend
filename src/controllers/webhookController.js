const { logger } = require('../utils/logger');
const crypto = require('crypto');

// Handle Slack webhook
const handleSlackWebhook = async (req, res) => {
  try {
    const { challenge, event } = req.body;
    
    // URL verification for Slack
    if (challenge) {
      return res.json({ challenge });
    }
    
    // Process event
    if (event && event.type === 'app_mention') {
      logger.info(`Slack mention received: ${event.text}`);
      // Process mention
    }
    
    res.json({ ok: true });
  } catch (error) {
    logger.error('Slack webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Handle Discord webhook
const handleDiscordWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;
    
    logger.info(`Discord webhook received: ${type}`);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Discord webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Handle GitHub webhook
const handleGitHubWebhook = async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const payload = req.body;
    
    logger.info(`GitHub webhook received: ${event}`);
    
    if (event === 'push') {
      // Handle push event
      logger.info(`Push to ${payload.repository?.full_name}: ${payload.ref}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('GitHub webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Generic webhook handler
const handleGenericWebhook = async (req, res) => {
  try {
    const { secret, data } = req.body;
    
    // Verify webhook secret
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (secret && expectedSecret && secret !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid secret' });
    }
    
    logger.info('Generic webhook received:', data);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Generic webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  handleSlackWebhook,
  handleDiscordWebhook,
  handleGitHubWebhook,
  handleGenericWebhook
};
