const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema(
  {
    url: {
      type: String,
    },
    capturedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, enum: ['verified', 'rejected', 'reopened'] },
    remarks: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const fieldVerificationSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    landParcel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LandParcel',
      required: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    verificationStatus: {
      type: String,
      required: true,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    dueDate: {
      type: Date,
    },
    remarks: {
      type: String,
    },
    location: {
      type: locationSchema,
    },
    photos: [photoSchema],
    verifiedAt: {
      type: Date,
    },
    isDemo: { type: Boolean, default: false, index: true },
    history: [historySchema],
  },
  {
    timestamps: true,
  }
);

fieldVerificationSchema.index({ landParcel: 1, createdAt: -1 });

module.exports = mongoose.model('FieldVerification', fieldVerificationSchema);
