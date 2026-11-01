const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Project = require('../models/Project');
const User = require('../models/User');

const statuses = new Set(['pending', 'verified', 'rejected']);
const transitions = { pending: new Set(['verified', 'rejected']), verified: new Set(['pending']), rejected: new Set(['pending']) };
const idIsValid = (id) => mongoose.isObjectIdOrHexString(id);
const canTransition = (currentStatus, nextStatus) => transitions[currentStatus]?.has(nextStatus) || false;
const validationFailure = (res, error) => {
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: 'Field verification validation failed', error: error.message });
  }
  console.error('Failed to process field verification:', error.message);
  return res.status(500).json({ message: 'Failed to process field verification' });
};

const validateReferences = async ({ projectId, parcelId, officerId }) => {
  if (![projectId, parcelId, officerId].every(idIsValid)) {
    return { status: 400, message: 'Valid project, parcel, and officer IDs are required' };
  }
  const [project, parcel, officer] = await Promise.all([
    Project.findById(projectId).select('_id isDemo'),
    LandParcel.findById(parcelId).select('project isDemo'),
    User.findOne({ _id: officerId, role: 'field_officer' }).select('_id isDemo'),
  ]);
  if (!project) return { status: 404, message: 'Project not found' };
  if (!parcel) return { status: 404, message: 'Land parcel not found' };
  if (String(parcel.project) !== String(projectId)) {
    return { status: 400, message: 'The selected parcel does not belong to the selected project' };
  }
  if (!officer) return { status: 404, message: 'Field officer not found' };
  return { isDemo: project.isDemo || parcel.isDemo || officer.isDemo };
};

const createFieldVerification = async (req, res) => {
  try {
    const body = req.body || {};
    const references = await validateReferences({
      projectId: body.project,
      parcelId: body.landParcel,
      officerId: body.verifiedBy,
    });
    if (references.status) return res.status(references.status).json({ message: references.message });
    if (body.verificationStatus && body.verificationStatus !== 'pending') {
      return res.status(400).json({ message: 'New inspections must begin in pending status' });
    }
    const verification = await FieldVerification.create({
      project: body.project,
      landParcel: body.landParcel,
      verifiedBy: body.verifiedBy,
      verificationStatus: 'pending',
      dueDate: body.dueDate,
      remarks: body.remarks,
      location: body.location,
      photos: body.photos,
      isDemo: references.isDemo,
    });
    await AuditLog.create({
      user: req.user._id,
      action: 'assigned',
      entityType: 'FieldVerification',
      entityId: verification._id,
      description: 'Field inspection assigned to an officer.',
      isDemo: verification.isDemo,
    });
    await verification.populate('project landParcel verifiedBy');
    return res.status(201).json({ message: 'Field inspection assigned successfully', fieldVerification: verification });
  } catch (error) {
    return validationFailure(res, error);
  }
};

const getFieldVerifications = async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) {
      if (!idIsValid(req.query.project)) return res.status(400).json({ message: 'Invalid project filter' });
      filter.project = req.query.project;
    }
    if (req.query.landParcel) {
      if (!idIsValid(req.query.landParcel)) return res.status(400).json({ message: 'Invalid parcel filter' });
      filter.landParcel = req.query.landParcel;
    }
    if (req.query.status) {
      if (!statuses.has(req.query.status)) return res.status(400).json({ message: 'Invalid verification status filter' });
      filter.verificationStatus = req.query.status;
    }
    if (req.user.role === 'field_officer') filter.verifiedBy = req.user._id;
    const fieldVerifications = await FieldVerification.find(filter)
      .populate('project landParcel verifiedBy')
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(2000)
      .lean();
    return res.status(200).json({ fieldVerifications });
  } catch (error) {
    return validationFailure(res, error);
  }
};

const getFieldVerificationById = async (req, res) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid field verification ID' });
  try {
    const fieldVerification = await FieldVerification.findById(req.params.id)
      .populate('project landParcel verifiedBy')
      .lean();
    if (!fieldVerification) return res.status(404).json({ message: 'Field verification not found' });
    if (req.user.role === 'field_officer' && String(fieldVerification.verifiedBy?._id || fieldVerification.verifiedBy) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Field verification not found' });
    }
    return res.status(200).json({ fieldVerification });
  } catch (error) {
    return validationFailure(res, error);
  }
};

const updateFieldVerification = async (req, res) => {
  if (!idIsValid(req.params.id)) return res.status(400).json({ message: 'Invalid field verification ID' });
  const body = req.body || {};
  const unsupported = Object.keys(body).filter((key) => !['verificationStatus', 'dueDate', 'remarks', 'location', 'photos'].includes(key));
  if (unsupported.length) return res.status(400).json({ message: `Unsupported update fields: ${unsupported.join(', ')}` });
  try {
    const verification = await FieldVerification.findById(req.params.id);
    if (!verification) return res.status(404).json({ message: 'Field verification not found' });
    if (req.user.role === 'field_officer' && String(verification.verifiedBy) !== String(req.user._id)) {
      return res.status(404).json({ message: 'Field verification not found' });
    }
    const statusChanged = Boolean(body.verificationStatus && body.verificationStatus !== verification.verificationStatus);
    if (statusChanged) {
      if (!canTransition(verification.verificationStatus, body.verificationStatus)) {
        return res.status(409).json({ message: `Invalid status transition from ${verification.verificationStatus} to ${body.verificationStatus}` });
      }
      if (typeof body.remarks !== 'string' || !body.remarks.trim()) {
        return res.status(400).json({ message: 'Remarks are required when changing an inspection status' });
      }
      const reopening = body.verificationStatus === 'pending';
      verification.verificationStatus = body.verificationStatus;
      verification.verifiedAt = body.verificationStatus === 'verified' ? new Date() : undefined;
      verification.history.push({
        actor: req.user._id,
        action: reopening ? 'reopened' : body.verificationStatus,
        remarks: body.remarks || verification.remarks,
        timestamp: new Date(),
      });
    }
    ['dueDate', 'remarks', 'location', 'photos'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) verification[field] = body[field];
    });
    await verification.save();
    if (Object.keys(body).length) {
      await AuditLog.create({
        user: req.user._id,
        action: statusChanged ? verification.history[verification.history.length - 1].action : 'updated',
        entityType: 'FieldVerification',
        entityId: verification._id,
        description: `Updated inspection fields: ${Object.keys(body).join(', ')}.`,
        isDemo: verification.isDemo,
      });
    }
    await verification.populate('project landParcel verifiedBy');
    return res.status(200).json({ message: 'Field verification updated successfully', fieldVerification: verification });
  } catch (error) {
    return validationFailure(res, error);
  }
};

const deleteFieldVerification = async (req, res) => {
  return res.status(405).json({ message: 'Field verification records are retained as history; update their status instead' });
};

module.exports = {
  createFieldVerification,
  getFieldVerifications,
  getFieldVerificationById,
  updateFieldVerification,
  deleteFieldVerification,
  canTransition,
};
