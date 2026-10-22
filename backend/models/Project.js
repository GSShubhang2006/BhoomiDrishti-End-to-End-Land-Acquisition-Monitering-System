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

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
      required: true,
    },
    milestones: [milestoneSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Project', projectSchema);
