const express = require('express');
const {
  createLandParcel,
  getLandParcels,
  getLandParcelById,
  updateLandParcel,
  deleteLandParcel,
} = require('../controllers/landParcelController');

const router = express.Router();

router.post('/', createLandParcel);
router.get('/', getLandParcels);
router.get('/:id', getLandParcelById);
router.put('/:id', updateLandParcel);
router.delete('/:id', deleteLandParcel);

module.exports = router;