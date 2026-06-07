const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const commandController = require('../controllers/commandController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

// Validation rules
const executeCommandValidation = [
  body('commandType').notEmpty().withMessage('Command type is required'),
  body('params').optional().isObject().withMessage('Params must be an object')
];

const bulkExecuteValidation = [
  body('deviceIds').isArray().withMessage('Device IDs must be an array'),
  body('commandType').notEmpty().withMessage('Command type is required'),
  body('params').optional().isObject().withMessage('Params must be an object')
];

// Routes
router.post('/:deviceId/execute', auth, executeCommandValidation, validate, commandController.executeCommand);
router.get('/:commandId/status', auth, commandController.getCommandStatus);
router.get('/device/:deviceId/history', auth, commandController.getCommandHistory);
router.post('/:commandId/cancel', auth, commandController.cancelCommand);
router.post('/result', commandController.receiveCommandResult); // Called by device
router.post('/bulk', auth, bulkExecuteValidation, validate, commandController.bulkExecuteCommands);

module.exports = router;
