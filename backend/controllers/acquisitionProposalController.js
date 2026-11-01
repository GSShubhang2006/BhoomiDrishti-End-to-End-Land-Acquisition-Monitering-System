const crypto = require('crypto');
const mongoose = require('mongoose');
const AcquisitionProposal = require('../models/AcquisitionProposal');
const LandParcel = require('../models/LandParcel');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const User = require('../models/User');
const { recordAudit } = require('../services/audit');

const editableFields = ['title', 'description', 'purpose', 'department', 'location', 'proposedArea', 'areaUnit', 'proposedParcels', 'project', 'documents'];
const areaUnits = ['acres', 'hectares', 'square_metres', 'square_feet'];
const decisionActions = ['approve', 'reject', 'request_changes'];

function apiError(res, error) {
  if (error.code === 'AUDIT_WRITE_FAILED') return res.status(503).json({ message: error.message });
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: 'Proposal validation failed', error: error.message });
  }
  if (error.code === 11000) return res.status(409).json({ message: 'A proposal with this identifier already exists' });
  console.error('Failed to process acquisition proposal request:', error.message);
  return res.status(500).json({ message: 'Failed to process acquisition proposal request' });
}

function pickFields(body, fields = editableFields) {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));
}

function isAdmin(user) {
  return user.role === 'admin';
}

function canEditDraft(user, proposal) {
  return isAdmin(user) || (user.role === 'project_officer' && String(proposal.createdBy) === String(user._id));
}

function canView(user, proposal) {
  if (user.role === 'admin' || user.role === 'project_officer' || user.role === 'viewer') return true;
  const reviewerId = proposal.assignedReviewer?._id || proposal.assignedReviewer;
  return user.role === 'reviewer' && String(reviewerId || '') === String(user._id);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function proposalNotification({ recipients, type, title, message, proposal }) {
  const distinctRecipients = [...new Set(recipients.map(String))];
  if (!distinctRecipients.length) return Promise.resolve();
  return Notification.create({
    key: `proposal:${proposal._id}:${type}:${crypto.randomUUID()}`,
    type,
    severity: type === 'proposal_rejected' ? 'high' : 'medium',
    title,
    message,
    proposal: proposal._id,
    recipients: distinctRecipients,
    isDemo: Boolean(proposal.isDemo),
  });
}

async function notifyReviewers(proposal, type, title, message) {
  const reviewers = await User.find({
    role: 'reviewer',
    $or: [{ department: proposal.department }, { department: { $exists: false } }, { department: null }, { department: '' }],
  }).select('_id').lean();
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  return proposalNotification({ recipients: [...admins.map(({ _id }) => _id), ...reviewers.map(({ _id }) => _id)], type, title, message, proposal });
}

async function notifyProposalParties(proposal, type, title, message) {
  const recipients = [proposal.createdBy, proposal.submittedBy, proposal.assignedReviewer].filter(Boolean);
  return proposalNotification({ recipients, type, title, message, proposal });
}

async function validateProject(projectId) {
  if (projectId === null || projectId === undefined || projectId === '') return null;
  if (!mongoose.isObjectIdOrHexString(projectId)) return false;
  return await Project.findOne({ _id: projectId, archivedAt: null }).select('_id').lean() || false;
}

const getReviewers = async (req, res) => {
  try {
    const reviewers = await User.find({ role: 'reviewer' }).select('name department').sort({ name: 1 }).lean();
    return res.status(200).json({ reviewers });
  } catch (error) {
    return apiError(res, error);
  }
};

async function validateParcelReferences(parcels, projectId) {
  for (const parcel of parcels || []) {
    if (!parcel.landParcel) continue;
    if (!projectId) return false;
    if (!mongoose.isObjectIdOrHexString(parcel.landParcel)) return false;
    const filter = { _id: parcel.landParcel };
    if (projectId) filter.project = projectId;
    if (!(await LandParcel.exists(filter))) return false;
  }
  return true;
}

async function audit(req, proposal, action, description) {
  await recordAudit({
    actorId: req.user._id,
    action,
    entityType: 'AcquisitionProposal',
    entityId: proposal._id,
    description,
    isDemo: Boolean(proposal.isDemo),
  });
}

const listProposals = async (req, res) => {
  if (req.user.role === 'field_officer') return res.status(403).json({ message: 'Your role is not permitted to access acquisition proposals' });
  if (!['admin', 'project_officer', 'reviewer', 'viewer'].includes(req.user.role)) return res.status(403).json({ message: 'Your role is not permitted to access acquisition proposals' });
  try {
    const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = {};
    if (req.user.role === 'reviewer') filter.assignedReviewer = req.user._id;
    if (req.query.status) {
      if (!['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'withdrawn'].includes(req.query.status)) {
        return res.status(400).json({ message: 'Unsupported proposal status filter' });
      }
      filter.status = req.query.status;
    }
    if (req.query.department) filter.department = String(req.query.department).slice(0, 150);
    if (req.query.project) {
      if (!mongoose.isObjectIdOrHexString(req.query.project)) return res.status(400).json({ message: 'Invalid project ID' });
      filter.project = req.query.project;
    }
    if (req.query.reviewer) {
      if (!mongoose.isObjectIdOrHexString(req.query.reviewer)) return res.status(400).json({ message: 'Invalid reviewer ID' });
      if (req.user.role === 'reviewer' && String(req.query.reviewer) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Reviewers can only filter their assigned proposals' });
      }
      filter.assignedReviewer = req.query.reviewer;
    }
    if (req.query.q) {
      const search = String(req.query.q).trim();
      if (search.length > 100) return res.status(400).json({ message: 'Search query must be 100 characters or fewer' });
      if (search) {
        const pattern = { $regex: escapeRegex(search), $options: 'i' };
        filter.$or = [{ proposalNumber: pattern }, { title: pattern }, { department: pattern }, { 'location.district': pattern }, { 'location.village': pattern }];
      }
    }
    const [proposals, total] = await Promise.all([
      AcquisitionProposal.find(filter)
        .populate('createdBy', 'name role')
        .populate('assignedReviewer', 'name role')
        .populate('project', 'name projectCode')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AcquisitionProposal.countDocuments(filter),
    ]);
    return res.status(200).json({ proposals, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return apiError(res, error);
  }
};

const getProposal = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  if (req.user.role === 'field_officer') return res.status(403).json({ message: 'Your role is not permitted to access acquisition proposals' });
  try {
    const proposal = await AcquisitionProposal.findById(req.params.id)
      .populate('createdBy', 'name role')
      .populate('submittedBy', 'name role')
      .populate('assignedReviewer', 'name role')
      .populate('project', 'name projectCode')
      .populate('reviewHistory.actor', 'name role')
      .lean();
    if (!proposal || !canView(req.user, proposal)) return res.status(404).json({ message: 'Proposal not found' });
    return res.status(200).json({ proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const createProposal = async (req, res) => {
  const body = req.body || {};
  if (Object.hasOwn(body, 'proposalNumber') || Object.hasOwn(body, 'status') || Object.hasOwn(body, 'createdBy')
    || Object.hasOwn(body, 'submittedBy') || Object.hasOwn(body, 'assignedReviewer') || Object.hasOwn(body, 'submittedAt')
    || Object.hasOwn(body, 'decisionAt') || Object.hasOwn(body, 'decisionRemarks') || Object.hasOwn(body, 'reviewHistory')) {
    return res.status(400).json({ message: 'Workflow fields and proposal numbers are assigned by the server' });
  }
  try {
    const values = pickFields(body);
    if (values.areaUnit && !areaUnits.includes(values.areaUnit)) return res.status(400).json({ message: 'Unsupported area unit' });
    const project = await validateProject(values.project);
    if (project === false) return res.status(400).json({ message: 'Invalid or unavailable project reference' });
    if (!(await validateParcelReferences(values.proposedParcels, values.project))) {
      return res.status(400).json({ message: 'A proposed parcel reference is invalid or does not belong to the selected project' });
    }
    const proposal = await AcquisitionProposal.create({
      ...values,
      project: project?._id || null,
      createdBy: req.user._id,
      isDemo: Boolean(req.user.isDemo),
      reviewHistory: [{ actor: req.user._id, action: 'created' }],
    });
    await audit(req, proposal, 'created', 'Acquisition proposal draft created.');
    return res.status(201).json({ message: 'Proposal draft created', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const updateProposal = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  const body = req.body || {};
  if (['proposalNumber', 'status', 'createdBy', 'submittedBy', 'assignedReviewer', 'submittedAt', 'decisionAt', 'decisionRemarks', 'reviewHistory'].some((field) => Object.hasOwn(body, field))) {
    return res.status(400).json({ message: 'Workflow fields cannot be changed through draft editing' });
  }
  try {
    const proposal = await AcquisitionProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    if (!['draft', 'changes_requested'].includes(proposal.status) || !canEditDraft(req.user, proposal)) return res.status(403).json({ message: 'You cannot edit this proposal in its current state' });
    const updates = pickFields(body);
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Provide at least one supported proposal field to update' });
    if (updates.areaUnit && !areaUnits.includes(updates.areaUnit)) return res.status(400).json({ message: 'Unsupported area unit' });
    const projectId = Object.hasOwn(updates, 'project') ? updates.project : proposal.project;
    const project = await validateProject(projectId);
    if (project === false) return res.status(400).json({ message: 'Invalid or unavailable project reference' });
    const parcels = Object.hasOwn(updates, 'proposedParcels') ? updates.proposedParcels : proposal.proposedParcels;
    if (!(await validateParcelReferences(parcels, project?._id || null))) {
      return res.status(400).json({ message: 'A proposed parcel reference is invalid or does not belong to the selected project' });
    }
    Object.assign(proposal, updates, { project: project?._id || null });
    proposal.reviewHistory.push({ actor: req.user._id, action: 'updated' });
    await proposal.save();
    await audit(req, proposal, 'updated', `Proposal draft updated: ${Object.keys(updates).join(', ')}.`);
    return res.status(200).json({ message: 'Proposal draft updated', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const submitProposal = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  try {
    const proposal = await AcquisitionProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    if (!canEditDraft(req.user, proposal) || !['draft', 'changes_requested'].includes(proposal.status)) {
      return res.status(403).json({ message: 'You cannot submit this proposal in its current state' });
    }
    proposal.status = 'submitted';
    proposal.submittedBy = req.user._id;
    proposal.submittedAt = new Date();
    proposal.decisionAt = null;
    proposal.decisionRemarks = undefined;
    proposal.reviewHistory.push({ actor: req.user._id, action: 'submitted' });
    await proposal.save();
    await audit(req, proposal, 'submitted', 'Acquisition proposal submitted for review.');
    await notifyReviewers(proposal, 'proposal_submitted', 'Acquisition proposal submitted', `${proposal.proposalNumber} is ready for reviewer assignment.`);
    return res.status(200).json({ message: 'Proposal submitted', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const assignReviewer = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  if (!mongoose.isObjectIdOrHexString(req.body?.reviewerId)) return res.status(400).json({ message: 'A valid reviewer ID is required' });
  try {
    const [proposal, reviewer] = await Promise.all([
      AcquisitionProposal.findById(req.params.id),
      User.findOne({ _id: req.body.reviewerId, role: 'reviewer' }).select('_id department'),
    ]);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    if (!reviewer) return res.status(400).json({ message: 'The selected user is not an available reviewer' });
    if (proposal.status !== 'submitted') return res.status(409).json({ message: 'Only submitted proposals can be assigned for review' });
    proposal.assignedReviewer = reviewer._id;
    proposal.status = 'under_review';
    proposal.reviewHistory.push({ actor: req.user._id, action: 'reviewer_assigned' });
    proposal.reviewHistory.push({ actor: req.user._id, action: 'review_started' });
    await proposal.save();
    await audit(req, proposal, 'reviewer_assigned', 'A reviewer was assigned and review started.');
    await proposalNotification({
      recipients: [reviewer._id],
      type: 'proposal_assigned',
      title: 'Acquisition proposal assigned',
      message: `${proposal.proposalNumber} has been assigned to you for review.`,
      proposal,
    });
    return res.status(200).json({ message: 'Reviewer assigned', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const reviewProposal = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  const { action, remarks } = req.body || {};
  const normalizedRemarks = typeof remarks === 'string' ? remarks.trim() : '';
  if (!decisionActions.includes(action)) return res.status(400).json({ message: 'Choose approve, reject or request_changes' });
  if (normalizedRemarks.length < 5 || normalizedRemarks.length > 1000) return res.status(400).json({ message: 'Decision remarks must contain 5 to 1000 characters' });
  try {
    const proposal = await AcquisitionProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    const isAssignedReviewer = req.user.role === 'reviewer' && String(proposal.assignedReviewer || '') === String(req.user._id);
    if (proposal.status !== 'under_review' || (!isAdmin(req.user) && !isAssignedReviewer)) {
      return res.status(404).json({ message: 'Proposal not found' });
    }
    const isProposalOriginator = String(proposal.createdBy) === String(req.user._id)
      || String(proposal.submittedBy) === String(req.user._id);
    if (action === 'approve' && isProposalOriginator) {
      return res.status(403).json({ message: 'You cannot approve a proposal that you created or submitted' });
    }
    const historyAction = action === 'request_changes' ? 'changes_requested' : action === 'approve' ? 'approved' : 'rejected';
    proposal.status = action === 'request_changes' ? 'changes_requested' : action === 'approve' ? 'approved' : 'rejected';
    proposal.decisionAt = new Date();
    proposal.decisionRemarks = normalizedRemarks;
    proposal.reviewHistory.push({ actor: req.user._id, action: historyAction, remarks: normalizedRemarks });
    await proposal.save();
    await audit(req, proposal, historyAction, `Proposal ${historyAction.replace('_', ' ')}: ${normalizedRemarks}`);
    const type = action === 'request_changes' ? 'proposal_changes_requested' : `proposal_${action === 'approve' ? 'approved' : 'rejected'}`;
    await notifyProposalParties(proposal, type, `Proposal ${historyAction.replace('_', ' ')}`, `${proposal.proposalNumber}: ${normalizedRemarks}`);
    return res.status(200).json({ message: `Proposal ${historyAction.replace('_', ' ')}`, proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const withdrawProposal = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  try {
    const proposal = await AcquisitionProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    const canWithdraw = ['draft', 'submitted'].includes(proposal.status)
      && (isAdmin(req.user) || (req.user.role === 'project_officer' && String(proposal.createdBy) === String(req.user._id)));
    if (!canWithdraw) return res.status(403).json({ message: 'You cannot withdraw this proposal in its current state' });
    proposal.status = 'withdrawn';
    proposal.decisionAt = new Date();
    proposal.reviewHistory.push({ actor: req.user._id, action: 'withdrawn' });
    await proposal.save();
    await audit(req, proposal, 'withdrawn', 'Acquisition proposal withdrawn.');
    await notifyProposalParties(proposal, 'proposal_withdrawn', 'Acquisition proposal withdrawn', `${proposal.proposalNumber} was withdrawn.`);
    return res.status(200).json({ message: 'Proposal withdrawn', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

const linkProject = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: 'Invalid proposal ID' });
  if (!mongoose.isObjectIdOrHexString(req.body?.projectId)) return res.status(400).json({ message: 'A valid project ID is required' });
  try {
    const [proposal, project] = await Promise.all([
      AcquisitionProposal.findById(req.params.id),
      Project.findById(req.body.projectId).select('_id name projectCode archivedAt'),
    ]);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    if (!project) return res.status(400).json({ message: 'The selected project does not exist' });
    if (project.archivedAt) return res.status(409).json({ message: 'Archived projects cannot be linked to proposals' });
    if (proposal.status !== 'approved') return res.status(409).json({ message: 'Only approved proposals can be linked to a project' });
    if (proposal.project && String(proposal.project) !== String(project._id)) return res.status(409).json({ message: 'This proposal is already linked to a different project' });
    if (proposal.project && String(proposal.project) === String(project._id)) return res.status(409).json({ message: 'This proposal is already linked to the selected project' });
    if (!isAdmin(req.user) && !(req.user.role === 'project_officer' && String(proposal.createdBy) === String(req.user._id))) {
      return res.status(403).json({ message: 'You are not permitted to link this proposal to a project' });
    }
    proposal.project = project._id;
    proposal.reviewHistory.push({ actor: req.user._id, action: 'project_linked', remarks: project.projectCode || project.name });
    await proposal.save();
    await audit(req, proposal, 'project_linked', `Approved proposal linked to project ${project.projectCode || project.name}.`);
    await notifyProposalParties(proposal, 'proposal_project_linked', 'Proposal linked to a project', `${proposal.proposalNumber} was linked to ${project.projectCode || project.name}.`);
    return res.status(200).json({ message: 'Proposal linked to project', proposal });
  } catch (error) {
    return apiError(res, error);
  }
};

module.exports = {
  assignReviewer,
  createProposal,
  getProposal,
  getReviewers,
  linkProject,
  listProposals,
  reviewProposal,
  submitProposal,
  updateProposal,
  withdrawProposal,
};
