const mongoose = require('mongoose');
const LandParcel = require('../models/LandParcel');
const Project = require('../models/Project');
const { recordAudit } = require('../services/audit');

const writableFields = [
  'projectCode',
  'name',
  'description',
  'projectType',
  'department',
  'location',
  'status',
  'startDate',
  'expectedEndDate',
  'milestones',
  'requiredDocumentTypes',
  'readinessWeights',
];

const pickWritableFields = (body) => Object.fromEntries(
  writableFields.filter((field) => Object.prototype.hasOwnProperty.call(body, field))
    .map((field) => [field, body[field]]),
);

const validationError = (res, error, entity) => {
  if (error.code === 'AUDIT_WRITE_FAILED') {
    return res.status(503).json({ message: error.message });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: `${entity} validation failed`, error: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ message: 'A project with this identifier already exists' });
  }
  console.error(`Failed to process ${entity.toLowerCase()} request:`, error.message);
  return res.status(500).json({ message: `Failed to process ${entity.toLowerCase()} request` });
};

const createProject = async (req, res) => {
  try {
    const project = await Project.create({ ...pickWritableFields(req.body || {}), createdBy: req.user._id });
    await recordAudit({
      actorId: req.user._id,
      action: 'created',
      entityType: 'Project',
      entityId: project._id,
      description: 'Project record created.',
      isDemo: project.isDemo,
    });
    return res.status(201).json({ message: 'Project created successfully', project });
  } catch (error) {
    return validationError(res, error, 'Project');
  }
};

const getProjects = async (req, res) => {
  try {
    const filter = { archivedAt: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.q) {
      const search = String(req.query.q).trim();
      if (search.length > 100) return res.status(400).json({ message: 'Search query must be 100 characters or fewer' });
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { projectCode: { $regex: escaped, $options: 'i' } },
          { location: { $regex: escaped, $options: 'i' } },
        ];
      }
    }
    const projects = await Project.find(filter).sort({ updatedAt: -1 }).limit(1000).lean();
    return res.status(200).json({ projects });
  } catch (error) {
    return validationError(res, error, 'Projects');
  }
};

const getProjectById = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ message: 'Project not found' });
    return res.status(200).json({ project });
  } catch (error) {
    return validationError(res, error, 'Project');
  }
};

const updateProject = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }
  try {
    const updates = pickWritableFields(req.body || {});
    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Provide at least one supported project field to update' });
    }
    const project = await Project.findByIdAndUpdate(req.params.id, { $set: updates }, {
      new: true,
      runValidators: true,
      context: 'query',
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await recordAudit({
      actorId: req.user._id,
      action: 'updated',
      entityType: 'Project',
      entityId: project._id,
      description: `Updated project fields: ${Object.keys(updates).join(', ')}.`,
      isDemo: project.isDemo,
    });
    return res.status(200).json({ message: 'Project updated successfully', project });
  } catch (error) {
    return validationError(res, error, 'Project');
  }
};

const archiveProject = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }
  try {
    const projectId = new mongoose.Types.ObjectId(req.params.id);
    const project = await Project.findByIdAndUpdate(
      projectId,
      { $set: { archivedAt: new Date() } },
      { new: true },
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await recordAudit({
      actorId: req.user._id,
      action: 'archived',
      entityType: 'Project',
      entityId: project._id,
      description: 'Project archived.',
      isDemo: project.isDemo,
    });
    return res.status(200).json({ message: 'Project archived successfully', project });
  } catch (error) {
    return validationError(res, error, 'Project');
  }
};

const deleteProject = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }
  try {
    const projectId = new mongoose.Types.ObjectId(req.params.id);
    const parcelExists = await LandParcel.exists({ project: projectId });
    if (parcelExists) {
      return res.status(409).json({ message: 'Project cannot be deleted while parcel records are associated with it; archive it instead' });
    }
    const project = await Project.findByIdAndDelete(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    await recordAudit({
      actorId: req.user._id,
      action: 'deleted',
      entityType: 'Project',
      entityId: project._id,
      description: 'Project record deleted after association checks.',
      isDemo: project.isDemo,
    });
    return res.status(200).json({ message: 'Project deleted successfully', project });
  } catch (error) {
    return validationError(res, error, 'Project');
  }
};

module.exports = { createProject, getProjects, getProjectById, updateProject, archiveProject, deleteProject };
