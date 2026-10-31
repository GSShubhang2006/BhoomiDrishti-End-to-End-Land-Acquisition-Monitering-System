const express = require('express');
const { requireRole } = require('../middleware/authentication');
const {
  createLandParcel,
  getLandParcels,
  getLandParcelById,
  updateLandParcel,
  deleteLandParcel,
} = require('../controllers/landParcelController');

const router = express.Router();

router.post('/', requireRole('admin', 'project_officer'), createLandParcel);
router.get('/', getLandParcels);
router.get('/:id', getLandParcelById);
router.put('/:id', requireRole('admin', 'project_officer'), updateLandParcel);
router.delete('/:id', requireRole('admin'), deleteLandParcel);

module.exports = router;