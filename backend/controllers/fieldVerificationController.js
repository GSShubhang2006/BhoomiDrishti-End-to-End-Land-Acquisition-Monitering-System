const mongoose = require('mongoose');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Project = require('../models/Project');
const User = require('../models/User');
const { store, getProjectById: findProjectById, getLandParcelById: findLandParcelById, getUserById: findUserById, createId } = require('../data/mockStore');
const { isDbReady } = require('../config/db');

const referenceModels = {
  project: Project,
  landParcel: LandParcel,
  verifiedBy: User,
};

const validateReferences = async (references, requireAll) => {
  for (const [field, Model] of Object.entries(referenceModels)) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(references, field)) {
      continue;
    }

    const referenceValue = references[field];
    const isMockReference = typeof referenceValue === 'string' && (
      referenceValue.startsWith('project_') ||
      referenceValue.startsWith('parcel_') ||
      referenceValue.startsWith('user_')
    );

    if (!mongoose.isObjectIdOrHexString(referenceValue) && !isMockReference) {
      return {
        status: 400,
        message: `A valid ${field} ID is required`,
      };
    }

    if (!isDbReady()) {
      const record = field === 'project'
        ? findProjectById(referenceValue)
        : field === 'landParcel'
          ? findLandParcelById(referenceValue)
          : findUserById(referenceValue);

      if (!record) {
        return {
          status: 404,
          message: `Referenced ${field} not found`,
        };
      }
      continue;
    }

    const record = await Model.findById(referenceValue).select('_id');
    if (!record) {
      return {
        status: 404,
        message: `Referenced ${field} not found`,
      };
    }
  }

  return null;
};

const createFieldVerification = async (req, res) => {
  try {
    const requestBody = req.body || {};
    const referenceError = await validateReferences(requestBody, true);
    if (referenceError) {
      return res.status(referenceError.status).json({
        message: referenceError.message,
      });
    }

    if (!isDbReady()) {
      const fieldVerification = {
        ...requestBody,
        _id: createId('verification'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.fieldVerifications.unshift(fieldVerification);
      return res.status(201).json({
        message: 'Field verification created successfully',
        fieldVerification,
      });
    }

    const fieldVerification = await FieldVerification.create(requestBody);
    await fieldVerification.populate('project landParcel verifiedBy');

    return res.status(201).json({
      message: 'Field verification created successfully',
      fieldVerification,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Field verification validation failed',
      });
    }

    return res.status(500).json({
      message: 'Failed to create field verification',
    });
  }
};

const getFieldVerifications = async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(200).json({ fieldVerifications: store.fieldVerifications });
    }

    const fieldVerifications = await FieldVerification.find()
      .populate('project landParcel verifiedBy')
      .sort({ createdAt: -1 });

    return res.status(200).json({ fieldVerifications });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get field verifications',
    });
  }
};

const getFieldVerificationById = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('verification_')) {
      return res.status(400).json({ message: 'Invalid field verification ID' });
    }

    if (!isDbReady()) {
      const fieldVerification = store.fieldVerifications.find((verification) => String(verification._id) === String(req.params.id));
      if (!fieldVerification) {
        return res.status(404).json({ message: 'Field verification not found' });
      }
      return res.status(200).json({ fieldVerification });
    }

    const fieldVerification = await FieldVerification.findById(req.params.id)
      .populate('project landParcel verifiedBy');

    if (!fieldVerification) {
      return res.status(404).json({ message: 'Field verification not found' });
    }

    return res.status(200).json({ fieldVerification });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get field verification',
    });
  }
};

const updateFieldVerification = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('verification_')) {
      return res.status(400).json({ message: 'Invalid field verification ID' });
    }

    const requestBody = req.body || {};
    const referenceError = await validateReferences(requestBody, false);
    if (referenceError) {
      return res.status(referenceError.status).json({
        message: referenceError.message,
      });
    }

    if (!isDbReady()) {
      const index = store.fieldVerifications.findIndex((verification) => String(verification._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Field verification not found' });
      }
      store.fieldVerifications[index] = {
        ...store.fieldVerifications[index],
        ...requestBody,
        _id: store.fieldVerifications[index]._id,
        updatedAt: new Date(),
      };
      return res.status(200).json({
        message: 'Field verification updated successfully',
        fieldVerification: store.fieldVerifications[index],
      });
    }

    const fieldVerification = await FieldVerification.findByIdAndUpdate(
      req.params.id,
      requestBody,
      {
        new: true,
        runValidators: true,
      }
    ).populate('project landParcel verifiedBy');

    if (!fieldVerification) {
      return res.status(404).json({ message: 'Field verification not found' });
    }

    return res.status(200).json({
      message: 'Field verification updated successfully',
      fieldVerification,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Field verification validation failed',
      });
    }

    return res.status(500).json({
      message: 'Failed to update field verification',
    });
  }
};

const deleteFieldVerification = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('verification_')) {
      return res.status(400).json({ message: 'Invalid field verification ID' });
    }

    if (!isDbReady()) {
      const index = store.fieldVerifications.findIndex((verification) => String(verification._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Field verification not found' });
      }
      const [fieldVerification] = store.fieldVerifications.splice(index, 1);
      return res.status(200).json({
        message: 'Field verification deleted successfully',
        fieldVerification,
      });
    }

    const fieldVerification = await FieldVerification.findByIdAndDelete(req.params.id);
    if (!fieldVerification) {
      return res.status(404).json({ message: 'Field verification not found' });
    }

    return res.status(200).json({
      message: 'Field verification deleted successfully',
      fieldVerification,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to delete field verification',
    });
  }
};

module.exports = {
  createFieldVerification,
  getFieldVerifications,
  getFieldVerificationById,
  updateFieldVerification,
  deleteFieldVerification,
};