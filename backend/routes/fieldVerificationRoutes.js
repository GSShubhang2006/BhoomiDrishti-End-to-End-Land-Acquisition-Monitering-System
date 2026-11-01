const express = require('express');
const { requireRole } = require('../middleware/authentication');
const {
  createFieldVerification,
  getFieldVerifications,
  getFieldVerificationById,
  updateFieldVerification,
  deleteFieldVerification,
} = require('../controllers/fieldVerificationController');

const router = express.Router();

router.post('/', requireRole('admin', 'project_officer'), createFieldVerification);
router.get('/', getFieldVerifications);
router.get('/:id', getFieldVerificationById);
router.put('/:id', requireRole('admin', 'project_officer', 'field_officer'), updateFieldVerification);
router.delete('/:id', requireRole('admin'), deleteFieldVerification);

module.exports = router;