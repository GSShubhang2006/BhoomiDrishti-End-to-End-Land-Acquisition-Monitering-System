const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: ['missing_document', 'pending_verification', 'pending_approval', 'compensation', 'overdue_milestone', 'readiness', 'proposal_submitted', 'proposal_assigned', 'proposal_changes_requested', 'proposal_approved', 'proposal_rejected', 'proposal_withdrawn', 'proposal_project_linked'],
    },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    landParcel: { type: mongoose.Schema.Types.ObjectId, ref: 'LandParcel' },
    proposal: { type: mongoose.Schema.Types.ObjectId, ref: 'AcquisitionProposal' },
    recipients: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: undefined },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolutionReason: { type: String, trim: true, maxlength: 500 },
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ resolvedAt: 1, severity: -1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
