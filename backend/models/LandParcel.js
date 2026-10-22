const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    address: {
      type: String,
    },
    village: {
      type: String,
    },
    taluk: {
      type: String,
    },
    district: {
      type: String,
    },
    state: {
      type: String,
    },
  },
  { _id: false }
);

const ownerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    contactNumber: {
      type: String,
    },
    address: {
      type: String,
    },
  },
  { _id: false }
);

const compensationSchema = new mongoose.Schema(
  {
    estimatedAmount: {
      type: Number,
    },
    approvedAmount: {
      type: Number,
    },
    paidAmount: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'partially_paid', 'paid'],
    },
    paymentDate: {
      type: Date,
    },
  },
  { _id: false }
);

const rehabilitationSchema = new mongoose.Schema(
  {
    required: {
      type: Boolean,
    },
    status: {
      type: String,
      enum: ['not_required', 'pending', 'in_progress', 'completed'],
    },
    details: {
      type: String,
    },
  },
  { _id: false }
);

const approvalSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    remarks: {
      type: String,
    },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    type: {
      type: String,
    },
    url: {
      type: String,
    },
    uploadedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const landParcelSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    surveyNumber: {
      type: String,
      required: true,
      trim: true,
    },
    area: {
      type: Number,
      required: true,
    },
    areaUnit: {
      type: String,
      default: 'acres',
    },
    location: {
      type: locationSchema,
    },
    landType: {
      type: String,
    },
    acquisitionStatus: {
      type: String,
      required: true,
      enum: [
        'identified',
        'verification_pending',
        'verified',
        'notice_issued',
        'compensation_pending',
        'compensation_paid',
        'possession_pending',
        'acquired',
      ],
      default: 'identified',
    },
    owner: {
      type: ownerSchema,
    },
    compensation: {
      type: compensationSchema,
    },
    rehabilitation: {
      type: rehabilitationSchema,
    },
    approval: {
      type: approvalSchema,
    },
    documents: [documentSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LandParcel', landParcelSchema);
