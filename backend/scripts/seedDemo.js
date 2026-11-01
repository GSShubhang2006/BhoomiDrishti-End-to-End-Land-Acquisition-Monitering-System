const crypto = require('crypto');
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const User = require('../models/User');

const ids = {
  admin: '670000000000000000000001',
  projectOfficer: '670000000000000000000002',
  fieldOfficer: '670000000000000000000003',
  roadProject: '671000000000000000000001',
  canalProject: '671000000000000000000002',
  railProject: '671000000000000000000003',
  roadParcelComplete: '672000000000000000000001',
  roadParcelBlocked: '672000000000000000000002',
  roadParcelInspection: '672000000000000000000003',
  canalParcelPending: '672000000000000000000004',
  railParcelReady: '672000000000000000000005',
  verificationComplete: '673000000000000000000001',
  verificationOverdue: '673000000000000000000002',
  verificationPending: '673000000000000000000003',
};

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const hashDemoPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const upsert = (Model, documents) => Model.bulkWrite(
  documents.map((document) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(document._id) },
      update: { $set: document },
      upsert: true,
    },
  })),
  { ordered: true },
);

async function seedDemo() {
  const uri = process.env.MONGO_URI;
  if (process.env.NODE_ENV !== 'development' || process.env.DEMO_SEED_CONFIRM !== 'YES') {
    throw new Error('Demo seed blocked. Set NODE_ENV=development and DEMO_SEED_CONFIRM=YES.');
  }
  if (!uri) {
    throw new Error('MONGO_URI is required.');
  }
  if (typeof process.env.DEMO_PASSWORD !== 'string' || process.env.DEMO_PASSWORD.length < 12) {
    throw new Error('Set DEMO_PASSWORD to a private value of at least 12 characters before seeding demo users.');
  }

  const databaseName = new URL(uri).pathname.replace(/^\/+/, '').split('?')[0];
  if (!databaseName.endsWith('_demo')) {
    throw new Error('Demo seed blocked: the MongoDB database name must end in _demo.');
  }

  await connectDB();
  const adminId = new mongoose.Types.ObjectId(ids.admin);
  const projectOfficerId = new mongoose.Types.ObjectId(ids.projectOfficer);
  const fieldOfficerId = new mongoose.Types.ObjectId(ids.fieldOfficer);
  const project = (id) => new mongoose.Types.ObjectId(id);
  await upsert(User, [
    { _id: adminId, name: 'Synthetic Demo Administrator', email: 'demo-admin@example.invalid', password: hashDemoPassword(process.env.DEMO_PASSWORD), role: 'admin', department: 'Synthetic demonstration records', isDemo: true },
    { _id: projectOfficerId, name: 'Synthetic Project Officer', email: 'demo-project-officer@example.invalid', password: hashDemoPassword(process.env.DEMO_PASSWORD), role: 'project_officer', department: 'Synthetic demonstration records', isDemo: true },
    { _id: fieldOfficerId, name: 'Synthetic Field Officer', email: 'demo-field-officer@example.invalid', password: hashDemoPassword(process.env.DEMO_PASSWORD), role: 'field_officer', department: 'Synthetic demonstration records', isDemo: true },
  ]);

  await upsert(Project, [
    {
      _id: project(ids.roadProject),
      projectCode: 'DEMO-HWY-001',
      name: '[SYNTHETIC] Saharpur Ring Road Expansion',
      description: 'Demonstration highway widening project; all associated records and map points are synthetic.',
      projectType: 'Highway',
      department: 'Synthetic demonstration records',
      location: 'Demonstration district A',
      status: 'in_progress',
      startDate: daysFromNow(-120),
      expectedEndDate: daysFromNow(180),
      createdBy: adminId,
      requiredDocumentTypes: ['Title deed', 'Identity proof', 'Survey plan'],
      milestones: [
        { name: 'Cadastral survey', dueDate: daysFromNow(-45), status: 'completed' },
        { name: 'Land notification', dueDate: daysFromNow(25), status: 'in_progress' },
        { name: 'Compensation review', dueDate: daysFromNow(-5), status: 'pending' },
      ],
      isDemo: true,
    },
    {
      _id: project(ids.canalProject),
      projectCode: 'DEMO-IRR-002',
      name: '[SYNTHETIC] Nawada Canal Rehabilitation',
      description: 'Demonstration canal rehabilitation project with pending field checks.',
      projectType: 'Irrigation',
      department: 'Synthetic demonstration records',
      location: 'Demonstration district B',
      status: 'planning',
      startDate: daysFromNow(-20),
      expectedEndDate: daysFromNow(300),
      createdBy: adminId,
      requiredDocumentTypes: ['Title deed', 'Survey plan'],
      milestones: [{ name: 'Initial demarcation', dueDate: daysFromNow(-2), status: 'pending' }],
      isDemo: true,
    },
    {
      _id: project(ids.railProject),
      projectCode: 'DEMO-RAIL-003',
      name: '[SYNTHETIC] East Connector Rail Link',
      description: 'Demonstration rail connector project; coordinates are not official survey data.',
      projectType: 'Rail',
      department: 'Synthetic demonstration records',
      location: 'Demonstration district C',
      status: 'in_progress',
      startDate: daysFromNow(-60),
      expectedEndDate: daysFromNow(240),
      createdBy: projectOfficerId,
      requiredDocumentTypes: ['Title deed', 'Identity proof'],
      milestones: [{ name: 'Site demarcation', dueDate: daysFromNow(14), status: 'in_progress' }],
      isDemo: true,
    },
  ]);

  const parcelRecords = [
    {
      _id: ids.roadParcelComplete, project: ids.roadProject, surveyNumber: 'DEMO-101-A', parcelCode: 'DEMO-P-001', area: 1.8, areaUnit: 'acres',
      location: { latitude: 28.6139, longitude: 77.2090, village: 'Synthetic village A', district: 'Demonstration district A', state: 'Demonstration only' },
      landType: 'Agricultural', acquisitionStatus: 'verified', owner: { name: 'Synthetic Owner A', contactNumber: 'REDACTED-DEMO', address: 'Synthetic address A' },
      compensation: { estimatedAmount: 500000, approvedAmount: 450000, paidAmount: 450000, currency: 'INR', status: 'paid', paymentDate: daysFromNow(-10) },
      rehabilitation: { required: true, status: 'completed', details: 'Synthetic completed R&R example' },
      approval: { status: 'approved', approvedBy: adminId, approvedAt: daysFromNow(-20), remarks: 'Synthetic demonstration approval' },
      documents: [
        { name: 'Title deed', type: 'Title deed', status: 'approved', uploadedAt: daysFromNow(-40) },
        { name: 'Identity proof', type: 'Identity proof', status: 'approved', uploadedAt: daysFromNow(-39) },
        { name: 'Survey plan', type: 'Survey plan', status: 'approved', uploadedAt: daysFromNow(-38) },
      ],
      isDemo: true,
    },
    {
      _id: ids.roadParcelBlocked, project: ids.roadProject, surveyNumber: 'DEMO-102-B', parcelCode: 'DEMO-P-002', area: 2.4, areaUnit: 'acres',
      location: { latitude: 28.6182, longitude: 77.2140, village: 'Synthetic village A', district: 'Demonstration district A', state: 'Demonstration only' },
      landType: 'Residential', acquisitionStatus: 'compensation_pending', owner: { name: 'Synthetic Owner B', contactNumber: 'REDACTED-DEMO', address: 'Synthetic address B' },
      compensation: { estimatedAmount: 800000, approvedAmount: 700000, paidAmount: 100000, currency: 'INR', status: 'partially_paid', dueDate: daysFromNow(-12) },
      rehabilitation: { required: true, status: 'pending', details: 'Synthetic pending resettlement case' },
      approval: { status: 'pending', remarks: 'Synthetic reviewer decision pending' },
      documents: [{ name: 'Title deed', type: 'Title deed', status: 'approved', uploadedAt: daysFromNow(-10) }],
      isDemo: true,
    },
    {
      _id: ids.roadParcelInspection, project: ids.roadProject, surveyNumber: 'DEMO-103-C', parcelCode: 'DEMO-P-003', area: 0.9, areaUnit: 'acres',
      location: { latitude: 28.6210, longitude: 77.2180, village: 'Synthetic village B', district: 'Demonstration district A', state: 'Demonstration only' },
      landType: 'Agricultural', acquisitionStatus: 'verification_pending', owner: { name: 'Synthetic Owner C', contactNumber: 'REDACTED-DEMO', address: 'Synthetic address C' },
      compensation: { estimatedAmount: 300000, approvedAmount: 250000, paidAmount: 0, currency: 'INR', status: 'pending', dueDate: daysFromNow(30) },
      rehabilitation: { required: false, status: 'not_required', details: 'Synthetic example; human review required' },
      approval: { status: 'pending', remarks: 'Synthetic approval pending' },
      documents: [
        { name: 'Title deed', type: 'Title deed', status: 'approved', uploadedAt: daysFromNow(-5) },
        { name: 'Survey plan', type: 'Survey plan', status: 'pending', uploadedAt: daysFromNow(-4) },
      ],
      isDemo: true,
    },
    {
      _id: ids.canalParcelPending, project: ids.canalProject, surveyNumber: 'DEMO-201-A', parcelCode: 'DEMO-P-004', area: 3.1, areaUnit: 'acres',
      location: { latitude: 25.0961, longitude: 85.3131, village: 'Synthetic village C', district: 'Demonstration district B', state: 'Demonstration only' },
      landType: 'Agricultural', acquisitionStatus: 'identified', owner: { name: 'Synthetic Owner D', contactNumber: 'REDACTED-DEMO', address: 'Synthetic address C' },
      compensation: { estimatedAmount: 1000000, paidAmount: 0, currency: 'INR', status: 'pending' },
      rehabilitation: { required: true, status: 'pending', details: 'Synthetic R&R assessment outstanding' },
      approval: { status: 'pending', remarks: 'Synthetic file not yet reviewed' },
      documents: [],
      isDemo: true,
    },
    {
      _id: ids.railParcelReady, project: ids.railProject, surveyNumber: 'DEMO-301-A', parcelCode: 'DEMO-P-005', area: 1.2, areaUnit: 'acres',
      location: { latitude: 26.8467, longitude: 80.9462, village: 'Synthetic village D', district: 'Demonstration district C', state: 'Demonstration only' },
      landType: 'Commercial', acquisitionStatus: 'acquired', owner: { name: 'Synthetic Owner E', contactNumber: 'REDACTED-DEMO', address: 'Synthetic address D' },
      compensation: { estimatedAmount: 650000, approvedAmount: 600000, paidAmount: 600000, currency: 'INR', status: 'paid', paymentDate: daysFromNow(-3) },
      rehabilitation: { required: false, status: 'not_required', details: 'Synthetic example' },
      approval: { status: 'approved', approvedBy: projectOfficerId, approvedAt: daysFromNow(-15), remarks: 'Synthetic approval' },
      documents: [
        { name: 'Title deed', type: 'Title deed', status: 'approved', uploadedAt: daysFromNow(-25) },
        { name: 'Identity proof', type: 'Identity proof', status: 'approved', uploadedAt: daysFromNow(-24) },
      ],
      isDemo: true,
    },
  ];

  await upsert(LandParcel, parcelRecords.map((record) => ({
    ...record,
    _id: new mongoose.Types.ObjectId(record._id),
    project: project(record.project),
    approval: record.approval?.approvedBy
      ? { ...record.approval, approvedBy: new mongoose.Types.ObjectId(record.approval.approvedBy) }
      : record.approval,
  })));

  await upsert(FieldVerification, [
    { _id: new mongoose.Types.ObjectId(ids.verificationComplete), project: project(ids.roadProject), landParcel: project(ids.roadParcelComplete), verifiedBy: fieldOfficerId, verificationStatus: 'verified', remarks: 'Synthetic completed field inspection.', location: { latitude: 28.6139, longitude: 77.2090 }, verifiedAt: daysFromNow(-18), isDemo: true },
    { _id: new mongoose.Types.ObjectId(ids.verificationOverdue), project: project(ids.roadProject), landParcel: project(ids.roadParcelInspection), verifiedBy: fieldOfficerId, verificationStatus: 'pending', dueDate: daysFromNow(-3), remarks: 'Synthetic overdue inspection example.', isDemo: true },
    { _id: new mongoose.Types.ObjectId(ids.verificationPending), project: project(ids.canalProject), landParcel: project(ids.canalParcelPending), verifiedBy: fieldOfficerId, verificationStatus: 'pending', dueDate: daysFromNow(10), remarks: 'Synthetic upcoming inspection example.', isDemo: true },
  ]);

  await upsert(Notification, [
    { _id: new mongoose.Types.ObjectId('674000000000000000000001'), key: 'demo:parcel:blocked:compensation', type: 'compensation', severity: 'high', title: 'Synthetic overdue compensation', message: 'A demonstration parcel has an outstanding payment and overdue due date.', project: project(ids.roadProject), landParcel: project(ids.roadParcelBlocked), isDemo: true },
    { _id: new mongoose.Types.ObjectId('674000000000000000000002'), key: 'demo:parcel:inspection:overdue', type: 'pending_verification', severity: 'high', title: 'Synthetic field inspection overdue', message: 'A demonstration parcel has an overdue field verification.', project: project(ids.roadProject), landParcel: project(ids.roadParcelInspection), isDemo: true },
    { _id: new mongoose.Types.ObjectId('674000000000000000000003'), key: 'demo:project:canal:milestone', type: 'overdue_milestone', severity: 'medium', title: 'Synthetic milestone overdue', message: 'The demonstration canal demarcation milestone is overdue.', project: project(ids.canalProject), isDemo: true },
  ]);

  await upsert(AuditLog, [
    { _id: new mongoose.Types.ObjectId('675000000000000000000001'), user: adminId, action: 'created', entityType: 'Project', entityId: project(ids.roadProject), description: 'Synthetic demonstration project created.', timestamp: daysFromNow(-120), isDemo: true },
    { _id: new mongoose.Types.ObjectId('675000000000000000000002'), user: fieldOfficerId, action: 'verified', entityType: 'FieldVerification', entityId: project(ids.verificationComplete), description: 'Synthetic field verification completed.', timestamp: daysFromNow(-18), isDemo: true },
    { _id: new mongoose.Types.ObjectId('675000000000000000000003'), user: projectOfficerId, action: 'created', entityType: 'LandParcel', entityId: project(ids.roadParcelBlocked), description: 'Synthetic parcel and compensation example created.', timestamp: daysFromNow(-12), isDemo: true },
  ]);

  console.log(`Idempotently seeded synthetic demonstration records into database "${databaseName}". No existing non-demo records were deleted.`);
}

seedDemo()
  .catch((error) => {
    console.error(`Demo seeding failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
