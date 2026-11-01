const mongoose = require('mongoose');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Project = require('../models/Project');
const { recordAudit } = require('../services/audit');

const writableFields = [
  'project',
  'surveyNumber',
  'surveyReferenceSource',
  'parcelCode',
  'area',
  'areaUnit',
  'location',
  'landType',
  'acquisitionStatus',
  'owner',
  'compensation',
  'rehabilitation',
  'approval',
  'documents',
];

const pickWritableFields = (body) => Object.fromEntries(
  writableFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => [field, body[field]]),
);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const surveyDuplicateFilter = ({ project, surveyNumber, location, excludeId }) => {
  const filter = {
    surveyNumber: { $regex: `^${escapeRegex(String(surveyNumber || '').trim())}$`, $options: 'i' },
  };
  const jurisdiction = [
    ['stateCode', location?.stateCode],
    ['districtCode', location?.districtCode],
    ['subdistrictCode', location?.subdistrictCode],
    ['villageCode', location?.villageCode],
    ['subdistrict', location?.subdistrict],
    ['state', location?.state],
    ['district', location?.district],
    ['taluk', location?.taluk],
    ['village', location?.village],
  ].filter(([, value]) => typeof value === 'string' && value.trim());
  if (jurisdiction.length) {
    jurisdiction.forEach(([field, value]) => {
      filter[`location.${field}`] = { $regex: `^${escapeRegex(value.trim())}$`, $options: 'i' };
    });
  } else if (project) {
    filter.project = project;
  }
  if (excludeId) filter._id = { $ne: excludeId };
  return filter;
};

const reportError = (res, error) => {
  if (error.code === 'AUDIT_WRITE_FAILED') {
    return res.status(503).json({ message: error.message });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: 'Land parcel validation failed', error: error.message });
  }
  console.error('Failed to process land parcel request:', error.message);
  return res.status(500).json({ message: 'Failed to process land parcel request' });
};

const validateProject = async (projectId) => {
  if (!mongoose.isObjectIdOrHexString(projectId)) {
    return { status: 400, message: 'A valid project ID is required' };
  }
  const project = await Project.findById(projectId).select('_id');
  return project ? null : { status: 404, message: 'Project not found' };
};

const validateLocation = (location) => {
  if (!location) return null;
  const hasLatitude = location.latitude !== undefined && location.latitude !== null && location.latitude !== '';
  const hasLongitude = location.longitude !== undefined && location.longitude !== null && location.longitude !== '';
  if (hasLatitude !== hasLongitude) {
    return 'Provide both latitude and longitude or leave both blank';
  }
  if (hasLatitude && (
    !Number.isFinite(Number(location.latitude)) ||
    Number(location.latitude) < -90 ||
    Number(location.latitude) > 90 ||
    !Number.isFinite(Number(location.longitude)) ||
    Number(location.longitude) < -180 ||
    Number(location.longitude) > 180
  )) {
    return 'Coordinates are outside valid latitude/longitude ranges';
  }
  return null;
};

const createLandParcel = async (req, res) => {
  try {
    const body = req.body || {};
    const locationError = validateLocation(body.location);
    if (locationError) return res.status(400).json({ message: locationError });
    const projectError = await validateProject(body.project);
    if (projectError) return res.status(projectError.status).json({ message: projectError.message });
    const duplicate = await LandParcel.exists(surveyDuplicateFilter({
      project: body.project,
      surveyNumber: body.surveyNumber,
      location: body.location,
    }));
    if (duplicate) return res.status(409).json({ message: 'A parcel with this survey number already exists in the project' });
    const landParcel = await LandParcel.create(pickWritableFields(body));
    await recordAudit({
      actorId: req.user._id,
      action: 'created',
      entityType: 'LandParcel',
      entityId: landParcel._id,
      description: 'Land parcel record created.',
      isDemo: landParcel.isDemo,
    });
    await landParcel.populate('project');
    return res.status(201).json({ message: 'Land parcel created successfully', landParcel });
  } catch (error) {
    return reportError(res, error);
  }
};

const getLandParcels = async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) {
      if (!mongoose.isObjectIdOrHexString(req.query.project)) return res.status(400).json({ message: 'Invalid project filter' });
      filter.project = req.query.project;
    }
    if (req.query.status) filter.acquisitionStatus = req.query.status;
    if (req.query.q) {
      const search = String(req.query.q).trim();
      if (search.length > 100) return res.status(400).json({ message: 'Search query must be 100 characters or fewer' });
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { surveyNumber: { $regex: escaped, $options: 'i' } },
          { parcelCode: { $regex: escaped, $options: 'i' } },
          { 'location.village': { $regex: escaped, $options: 'i' } },
          { 'location.district': { $regex: escaped, $options: 'i' } },
        ];
      }
    }
    const landParcels = await LandParcel.find(filter).populate('project').sort({ createdAt: -1 }).limit(2000).lean();
    return res.status(200).json({ landParcels });
  } catch (error) {
    return reportError(res, error);
  }
};

const getLandParcelById = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid land parcel ID' });
  try {
    const landParcel = await LandParcel.findById(req.params.id).populate('project').lean();
    if (!landParcel) return res.status(404).json({ message: 'Land parcel not found' });
    return res.status(200).json({ landParcel });
  } catch (error) {
    return reportError(res, error);
  }
};

const updateLandParcel = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid land parcel ID' });
  try {
    const updates = pickWritableFields(req.body || {});
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide at least one supported parcel field to update' });
    const locationError = validateLocation(updates.location);
    if (locationError) return res.status(400).json({ message: locationError });
    if (updates.project) {
      const projectError = await validateProject(updates.project);
      if (projectError) return res.status(projectError.status).json({ message: projectError.message });
    }

    const current = await LandParcel.findById(req.params.id).select('project surveyNumber location isDemo');
    if (!current) return res.status(404).json({ message: 'Land parcel not found' });
    const projectId = updates.project || current.project;
    const surveyNumber = updates.surveyNumber || current.surveyNumber;
    const location = updates.location || current.location;
    const duplicate = await LandParcel.exists(surveyDuplicateFilter({
      project: projectId,
      surveyNumber,
      location,
      excludeId: current._id,
    }));
    if (duplicate) return res.status(409).json({ message: 'A parcel with this survey number already exists in the project' });

    const landParcel = await LandParcel.findByIdAndUpdate(req.params.id, { $set: updates }, {
      new: true,
      runValidators: true,
      context: 'query',
    }).populate('project');
    await recordAudit({
      actorId: req.user._id,
      action: 'updated',
      entityType: 'LandParcel',
      entityId: landParcel._id,
      description: `Updated parcel fields: ${Object.keys(updates).join(', ')}.`,
      isDemo: landParcel.isDemo,
    });
    return res.status(200).json({ message: 'Land parcel updated successfully', landParcel });
  } catch (error) {
    return reportError(res, error);
  }
};

const deleteLandParcel = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid land parcel ID' });
  try {
    const verificationExists = await FieldVerification.exists({ landParcel: req.params.id });
    if (verificationExists) {
      return res.status(409).json({ message: 'Parcel cannot be deleted while verification history is associated with it' });
    }
    const landParcel = await LandParcel.findByIdAndDelete(req.params.id);
    if (!landParcel) return res.status(404).json({ message: 'Land parcel not found' });
    await recordAudit({
      actorId: req.user._id,
      action: 'deleted',
      entityType: 'LandParcel',
      entityId: landParcel._id,
      description: 'Land parcel record deleted after verification-history checks.',
      isDemo: landParcel.isDemo,
    });
    return res.status(200).json({ message: 'Land parcel deleted successfully', landParcel });
  } catch (error) {
    return reportError(res, error);
  }
};

module.exports = { createLandParcel, getLandParcels, getLandParcelById, updateLandParcel, deleteLandParcel, surveyDuplicateFilter };
