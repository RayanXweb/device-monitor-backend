const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const messageController = require('../controllers/messageController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const sendSMSValidation = [
  body('number').notEmpty().withMessage('Phone number is required'),
  body('message').notEmpty().withMessage('Message is required')
];

router.get('/:deviceId/sms', auth, messageController.getSMS);
router.post('/:deviceId/sms/sync', messageController.syncSMS);
router.post('/:deviceId/sms/send', auth, sendSMSValidation, validate, messageController.sendSMS);
router.get('/:deviceId/contacts', auth, messageController.getContacts);
router.post('/:deviceId/contacts/sync', messageController.syncContacts);
router.get('/:deviceId/call-logs', auth, messageController.getCallLogs);
router.post('/:deviceId/call-logs/sync', messageController.syncCallLogs);

module.exports = router;
