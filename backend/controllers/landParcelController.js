const mongoose = require('mongoose');
const LandParcel = require('../models/LandParcel');
const Project = require('../models/Project');
const { store, getProjectById: findProjectById, getLandParcelById: findLandParcelById, createId } = require('../data/mockStore');
const { isDbReady } = require('../config/db');

const createLandParcel = async (req, res) => {
  try {
    const projectId = req.body.project;
    if (!mongoose.isObjectIdOrHexString(projectId) && !String(projectId).startsWith('project_')) {
      return res.status(400).json({ message: 'A valid project ID is required' });
    }

    if (!isDbReady()) {
      const project = findProjectById(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      const landParcel = {
        ...req.body,
        _id: createId('parcel'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.landParcels.unshift(landParcel);
      return res.status(201).json({
        message: 'Land parcel created successfully',
        landParcel,
      });
    }

    const project = await Project.findById(req.body.project);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const landParcel = await LandParcel.create(req.body);
    await landParcel.populate('project');

    return res.status(201).json({
      message: 'Land parcel created successfully',
      landParcel,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Land parcel validation failed',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to create land parcel',
      error: error.message,
    });
  }
};

const getLandParcels = async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.status(200).json({ landParcels: store.landParcels });
    }

    const landParcels = await LandParcel.find().populate('project').sort({ createdAt: -1 });

    return res.status(200).json({ landParcels });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get land parcels',
      error: error.message,
    });
  }
};

const getLandParcelById = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('parcel_')) {
      return res.status(400).json({ message: 'Invalid land parcel ID' });
    }

    if (!isDbReady()) {
      const landParcel = findLandParcelById(req.params.id);
      if (!landParcel) {
        return res.status(404).json({ message: 'Land parcel not found' });
      }
      return res.status(200).json({ landParcel });
    }

    const landParcel = await LandParcel.findById(req.params.id).populate('project');
    if (!landParcel) {
      return res.status(404).json({ message: 'Land parcel not found' });
    }

    return res.status(200).json({ landParcel });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to get land parcel',
      error: error.message,
    });
  }
};

const updateLandParcel = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('parcel_')) {
      return res.status(400).json({ message: 'Invalid land parcel ID' });
    }

    if (!isDbReady()) {
      const index = store.landParcels.findIndex((parcel) => String(parcel._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Land parcel not found' });
      }
      store.landParcels[index] = {
        ...store.landParcels[index],
        ...req.body,
        _id: store.landParcels[index]._id,
        updatedAt: new Date(),
      };
      return res.status(200).json({
        message: 'Land parcel updated successfully',
        landParcel: store.landParcels[index],
      });
    }

    const landParcel = await LandParcel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('project');

    if (!landParcel) {
      return res.status(404).json({ message: 'Land parcel not found' });
    }

    return res.status(200).json({
      message: 'Land parcel updated successfully',
      landParcel,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        message: 'Land parcel validation failed',
        error: error.message,
      });
    }

    return res.status(500).json({
      message: 'Failed to update land parcel',
      error: error.message,
    });
  }
};

const deleteLandParcel = async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id) && !req.params.id.startsWith('parcel_')) {
      return res.status(400).json({ message: 'Invalid land parcel ID' });
    }

    if (!isDbReady()) {
      const index = store.landParcels.findIndex((parcel) => String(parcel._id) === String(req.params.id));
      if (index === -1) {
        return res.status(404).json({ message: 'Land parcel not found' });
      }
      const [landParcel] = store.landParcels.splice(index, 1);
      return res.status(200).json({
        message: 'Land parcel deleted successfully',
        landParcel,
      });
    }

    const landParcel = await LandParcel.findByIdAndDelete(req.params.id);
    if (!landParcel) {
      return res.status(404).json({ message: 'Land parcel not found' });
    }

    return res.status(200).json({
      message: 'Land parcel deleted successfully',
      landParcel,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to delete land parcel',
      error: error.message,
    });
  }
};

module.exports = {
  createLandParcel,
  getLandParcels,
  getLandParcelById,
  updateLandParcel,
  deleteLandParcel,
};