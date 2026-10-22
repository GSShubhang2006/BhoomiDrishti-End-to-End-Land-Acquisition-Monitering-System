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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('FieldVerification', fieldVerificationSchema);
