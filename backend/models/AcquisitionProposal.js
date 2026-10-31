const crypto = require('crypto');
const mongoose = require('mongoose');

const areaUnits = ['acres', 'hectares', 'square_metres', 'square_feet'];
const proposalStatuses = ['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'withdrawn'];

const proposedParcelSchema = new mongoose.Schema(
  {
    surveyReference: { type: String, required: true, trim: true, maxlength: 100 },
    area: { type: Number, required: true, min: 0.0001 },
    areaUnit: { type: String, enum: areaUnits, required: true },
    location: {
      state: { type: String, trim: true, maxlength: 100 },
      district: { type: String, trim: true, maxlength: 100 },
      taluk: { type: String, trim: true, maxlength: 100 },
      village: { type: String, trim: true, maxlength: 100 },
      address: { type: String, trim: true, maxlength: 300 },
    },
    landParcel: { type: mongoose.Schema.Types.ObjectId, ref: 'LandParcel' },
  },
  { _id: true },
);

const proposalDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    type: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ['pending', 'received', 'approved', 'rejected'], default: 'received' },
    receivedAt: { type: Date },
    reviewRemarks: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true },
);

const reviewHistorySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['created', 'updated', 'submitted', 'review_started', 'reviewer_assigned', 'changes_requested', 'approved', 'rejected', 'withdrawn', 'project_linked'],
      required: true,
    },
    remarks: { type: String, trim: true, maxlength: 1000 },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { _id: true },
);

const acquisitionProposalSchema = new mongoose.Schema(
  {
    proposalNumber: { type: String, required: true, unique: true, immutable: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    purpose: { type: String, required: true, trim: true, maxlength: 2000 },
    department: { type: String, required: true, trim: true, maxlength: 150 },
    location: {
      state: { type: String, required: true, trim: true, maxlength: 100 },
      district: { type: String, required: true, trim: true, maxlength: 100 },
      taluk: { type: String, trim: true, maxlength: 100 },
      village: { type: String, trim: true, maxlength: 100 },
      address: { type: String, trim: true, maxlength: 300 },
    },
    proposedArea: { type: Number, required: true, min: 0.0001 },
    areaUnit: { type: String, required: true, enum: areaUnits },
    proposedParcels: {
      type: [proposedParcelSchema],
      default: [],
      validate: { validator: (parcels) => parcels.length <= 500, message: 'A proposal can include at most 500 parcel descriptions' },
    },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: proposalStatuses, default: 'draft', required: true },
    submittedAt: { type: Date, default: null },
    decisionAt: { type: Date, default: null },
    decisionRemarks: { type: String, trim: true, maxlength: 1000 },
    documents: { type: [proposalDocumentSchema], default: [] },
    reviewHistory: { type: [reviewHistorySchema], default: [] },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

acquisitionProposalSchema.pre('validate', function generateProposalNumber() {
  if (!this.proposalNumber) {
    const year = new Date().getUTCFullYear();
    const suffix = crypto.randomBytes(12).toString('hex').toUpperCase();
    this.proposalNumber = `ACQ-${year}-${suffix}`;
  }
});

acquisitionProposalSchema.index({ status: 1, createdAt: -1 });
acquisitionProposalSchema.index({ department: 1, createdAt: -1 });
acquisitionProposalSchema.index({ project: 1 });
acquisitionProposalSchema.index({ assignedReviewer: 1, status: 1 });

module.exports = mongoose.model('AcquisitionProposal', acquisitionProposalSchema);
