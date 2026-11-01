const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'delayed'],
    },
  },
  { _id: false }
);

const readinessWeightsSchema = new mongoose.Schema(
  {
    missingDocument: { type: Number, min: 0 },
    documentReviewPending: { type: Number, min: 0 },
    unconfiguredChecklist: { type: Number, min: 0 },
    verificationNotScheduled: { type: Number, min: 0 },
    verificationPending: { type: Number, min: 0 },
    verificationOverdue: { type: Number, min: 0 },
    approvalPending: { type: Number, min: 0 },
    approvalUnknown: { type: Number, min: 0 },
    compensationOutstanding: { type: Number, min: 0 },
    compensationUnknown: { type: Number, min: 0 },
    rehabilitationOutstanding: { type: Number, min: 0 },
    rehabilitationUnknown: { type: Number, min: 0 },
    overdueMilestone: { type: Number, min: 0 },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    projectCode: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
    },
    projectType: {
      type: String,
    },
    department: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['planning', 'in_progress', 'delayed', 'completed', 'cancelled'],
      default: 'planning',
    },
    startDate: {
      type: Date,
    },
    expectedEndDate: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDemo: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    milestones: [milestoneSchema],
    requiredDocumentTypes: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    readinessWeights: {
      type: readinessWeightsSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ projectCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Project', projectSchema);
