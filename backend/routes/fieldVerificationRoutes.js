const express = require('express');
const {
  createFieldVerification,
  getFieldVerifications,
  getFieldVerificationById,
  updateFieldVerification,
  deleteFieldVerification,
} = require('../controllers/fieldVerificationController');

const router = express.Router();

router.post('/', createFieldVerification);
router.get('/', getFieldVerifications);
router.get('/:id', getFieldVerificationById);
router.put('/:id', updateFieldVerification);
router.delete('/:id', deleteFieldVerification);

module.exports = router;