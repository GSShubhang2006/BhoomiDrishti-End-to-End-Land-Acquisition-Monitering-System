const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
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
    stateCode: {
      type: String,
      trim: true,
    },
    districtCode: {
      type: String,
      trim: true,
    },
    subdistrictCode: {
      type: String,
      trim: true,
    },
    villageCode: {
      type: String,
      trim: true,
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
      min: 0,
    },
    approvedAmount: {
      type: Number,
      min: 0,
    },
    paidAmount: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'partially_paid', 'paid'],
    },
    dueDate: {
      type: Date,
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
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedAt: {
      type: Date,
    },
    reviewRemarks: {
      type: String,
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
      maxlength: 100,
    },
    surveyReferenceSource: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    parcelCode: {
      type: String,
      trim: true,
    },
    area: {
      type: Number,
      required: true,
      min: 0.0001,
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
    subdistrict: {
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
    isDemo: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LandParcel', landParcelSchema);
