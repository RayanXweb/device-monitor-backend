const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const fileController = require('../controllers/fileController');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const downloadFileValidation = [
  body('filePath').notEmpty().withMessage('File path is required')
];

const deleteFileValidation = [
  body('filePath').notEmpty().withMessage('File path is required')
];

router.get('/:deviceId/list', auth, fileController.listFiles);
router.post('/:deviceId/download', auth, downloadFileValidation, validate, fileController.downloadFile);
router.post('/:deviceId/receive', fileController.receiveFile);
router.post('/:deviceId/delete', auth, deleteFileValidation, validate, fileController.deleteFile);
router.post('/:deviceId/upload', auth, fileController.uploadFile);

module.exports = router;
