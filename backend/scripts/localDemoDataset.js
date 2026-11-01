const crypto = require('node:crypto');

const departments = [
  'Public Works Department (PWD)',
  'National Highways Authority of India (NHAI)',
  'Ministry of Road Transport and Highways (MoRTH)',
  'Irrigation and Water Resources Department',
  'Indian Railways',
  'Ministry of Railways',
  'Energy and Power Department',
  'Urban Development and Municipal Administration',
  'Rural Development Department',
  'Housing and Urban Development Department',
  'Industrial Development Department',
  'Water Supply and Sanitation Department',
];

const locations = [
  { district: 'Bengaluru Rural', taluk: 'Devanahalli', latitude: 13.24, longitude: 77.71 },
  { district: 'Ramanagara', taluk: 'Ramanagara', latitude: 12.72, longitude: 77.28 },
  { district: 'Tumakuru', taluk: 'Tumakuru', latitude: 13.34, longitude: 77.10 },
  { district: 'Mysuru', taluk: 'Mysuru', latitude: 12.30, longitude: 76.65 },
  { district: 'Belagavi', taluk: 'Belagavi', latitude: 15.85, longitude: 74.50 },
  { district: 'Dharwad', taluk: 'Hubballi', latitude: 15.36, longitude: 75.12 },
  { district: 'Kalaburagi', taluk: 'Kalaburagi', latitude: 17.33, longitude: 76.83 },
  { district: 'Shivamogga', taluk: 'Shivamogga', latitude: 13.93, longitude: 75.57 },
];

const projectStatuses = [
  'planning', 'planning', 'planning',
  'in_progress', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'in_progress',
  'delayed', 'delayed', 'delayed',
  'completed', 'completed', 'completed', 'completed',
  'cancelled',
];

const parcelStatuses = [
  'identified',
  'verification_pending',
  'verified',
  'notice_issued',
  'compensation_pending',
  'compensation_paid',
  'possession_pending',
  'acquired',
];

const compensationStatuses = ['pending', 'approved', 'partially_paid', 'paid'];
const verificationStatuses = ['pending', 'verified', 'rejected'];
const approvalStatuses = ['pending', 'approved', 'rejected'];
const documentTypes = ['Title deed', 'Identity proof', 'Survey plan'];

const stableId = (collection, key) => crypto
  .createHash('sha256')
  .update(`bhoomidrishti-local-demo:${collection}:${key}`)
  .digest('hex')
  .slice(0, 24);

const daysFrom = (now, days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const padded = (value, width = 3) => String(value).padStart(width, '0');

function buildLocalDemoDataset(now = new Date()) {
  const users = [
    { key: 'field-officer-01', name: 'Synthetic Demo Field Officer 01', email: 'local-demo-field-officer-01@bhoomidrishti.invalid', role: 'field_officer', department: departments[0] },
    { key: 'field-officer-02', name: 'Synthetic Demo Field Officer 02', email: 'local-demo-field-officer-02@bhoomidrishti.invalid', role: 'field_officer', department: departments[3] },
    { key: 'project-officer', name: 'Synthetic Demo Project Officer', email: 'local-demo-project-officer@bhoomidrishti.invalid', role: 'project_officer', department: departments[0] },
    { key: 'reviewer', name: 'Synthetic Demo Reviewer', email: 'local-demo-reviewer@bhoomidrishti.invalid', role: 'reviewer', department: departments[2] },
  ].map((user) => ({
    _id: stableId('user', user.key),
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    isDemo: true,
  }));

  const projectOfficerId = users.find((user) => user.role === 'project_officer')._id;
  const reviewerId = users.find((user) => user.role === 'reviewer')._id;
  const fieldOfficerIds = users.filter((user) => user.role === 'field_officer').map((user) => user._id);

  const projects = Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const place = locations[index % locations.length];
    const code = padded(number);
    return {
      _id: stableId('project', code),
      projectCode: `LOCAL-DEMO-PRJ-${code}`,
      name: `[SYNTHETIC DEMO] ${place.district} ${['Road', 'Canal', 'Rail', 'Power'][index % 4]} Project ${code}`,
      description: 'Synthetic demonstration project. It is not an official government project or land record.',
      projectType: ['Road', 'Canal', 'Rail', 'Power'][index % 4],
      department: departments[index % departments.length],
      location: `[SYNTHETIC DEMO] ${place.taluk} Taluk, ${place.district} District, Karnataka`,
      status: projectStatuses[index],
      startDate: daysFrom(now, -210 + index * 7),
      expectedEndDate: daysFrom(now, 90 + index * 13),
      createdBy: projectOfficerId,
      requiredDocumentTypes: documentTypes,
      milestones: [
        { name: 'Synthetic site survey', dueDate: daysFrom(now, -45 + index), status: index % 3 === 0 ? 'completed' : 'in_progress' },
        { name: 'Synthetic document review', dueDate: daysFrom(now, -12 + index * 2), status: index % 4 === 0 ? 'delayed' : 'pending' },
        { name: 'Synthetic acquisition review', dueDate: daysFrom(now, 30 + index * 3), status: 'pending' },
      ],
      isDemo: true,
    };
  });

  const parcels = Array.from({ length: 180 }, (_, index) => {
    const number = index + 1;
    const project = projects[index % projects.length];
    const place = locations[index % locations.length];
    const villageNumber = Math.floor(index / locations.length) + 1;
    const ownerNumber = (index % 100) + 1;
    const status = parcelStatuses[index % parcelStatuses.length];
    const compensationStatus = compensationStatuses[index % compensationStatuses.length];
    const estimatedAmount = 420000 + (index % 37) * 17500;
    const approvedAmount = Math.round(estimatedAmount * (0.82 + (index % 7) * 0.02));
    const paidAmount = compensationStatus === 'paid'
      ? approvedAmount
      : compensationStatus === 'partially_paid'
        ? Math.round(approvedAmount * 0.45)
        : 0;
    const rehabilitationRequired = index % 5 !== 0;
    const rehabilitationStatus = rehabilitationRequired
      ? ['pending', 'in_progress', 'completed'][index % 3]
      : 'not_required';
    const approvalStatus = approvalStatuses[index % approvalStatuses.length];
    const latitude = place.latitude + ((index % 9) - 4) * 0.0012;
    const longitude = place.longitude + ((index % 11) - 5) * 0.0011;

    return {
      _id: stableId('parcel', padded(number)),
      project: project._id,
      surveyNumber: `SYN-KA-DEMO-${padded(number, 4)}`,
      surveyReferenceSource: 'Synthetic demonstration reference; not an official survey number.',
      parcelCode: `LOCAL-DEMO-PCL-${padded(number)}`,
      area: Number((0.45 + (index % 24) * 0.17).toFixed(2)),
      areaUnit: 'acres',
      location: {
        latitude,
        longitude,
        address: `Synthetic demo location and coordinates ${padded(number)}; not a verified parcel address or boundary.`,
        village: `Synthetic Demo Village ${padded(villageNumber, 2)}`,
        taluk: place.taluk,
        district: place.district,
        state: 'Karnataka',
      },
      landType: ['Agricultural', 'Residential', 'Commercial'][index % 3],
      subdistrict: place.taluk,
      acquisitionStatus: status,
      owner: {
        name: `Synthetic Demo Landholder ${padded(ownerNumber)}`,
        contactNumber: `SYNTHETIC-NON-DELIVERABLE-${padded(ownerNumber)}`,
        address: `Synthetic demo address ${padded(ownerNumber)}, ${place.district}, Karnataka`,
      },
      compensation: {
        estimatedAmount,
        approvedAmount,
        paidAmount,
        currency: 'INR',
        status: compensationStatus,
        dueDate: daysFrom(now, (index % 31) - 15),
        ...(compensationStatus === 'paid' ? { paymentDate: daysFrom(now, -((index % 20) + 1)) } : {}),
      },
      rehabilitation: {
        required: rehabilitationRequired,
        status: rehabilitationStatus,
        details: rehabilitationRequired
          ? 'Synthetic affected-family and resettlement example; no real household is represented.'
          : 'Synthetic example; rehabilitation is marked not required.',
      },
      approval: {
        status: approvalStatus,
        ...(approvalStatus === 'approved'
          ? { approvedBy: reviewerId, approvedAt: daysFrom(now, -((index % 60) + 1)) }
          : {}),
        remarks: `Synthetic demonstration approval state: ${approvalStatus}.`,
      },
      documents: documentTypes.map((type, documentIndex) => ({
        name: `SYNTHETIC PLACEHOLDER - ${type}`,
        type,
        uploadedAt: daysFrom(now, -((index + documentIndex) % 90)),
        status: (index + documentIndex) % 4 === 0 ? 'approved' : 'pending',
        reviewRemarks: 'Synthetic placeholder metadata only; no actual document has been uploaded or verified.',
      })),
      isDemo: true,
    };
  });

  const verifications = Array.from({ length: 120 }, (_, index) => {
    const parcel = parcels[index];
    const project = projects[index % projects.length];
    const status = verificationStatuses[index % verificationStatuses.length];
    const officerId = fieldOfficerIds[index % fieldOfficerIds.length];
    return {
      _id: stableId('field-verification', padded(index + 1)),
      project: project._id,
      landParcel: parcel._id,
      verifiedBy: officerId,
      verificationStatus: status,
      dueDate: daysFrom(now, status === 'pending' ? (index % 9) - 4 : -((index % 35) + 1)),
      remarks: `Synthetic field verification example with status ${status}; coordinates are synthetic and no official inspection occurred.`,
      location: {
        latitude: parcel.location.latitude,
        longitude: parcel.location.longitude,
      },
      ...(status !== 'pending'
        ? {
          verifiedAt: daysFrom(now, -((index % 30) + 1)),
          history: [{
            actor: officerId,
            action: status,
            remarks: 'Synthetic demonstration outcome; not a real field-verification result.',
            timestamp: daysFrom(now, -((index % 30) + 1)),
          }],
        }
        : {}),
      isDemo: true,
    };
  });

  const notifications = Array.from({ length: 40 }, (_, index) => {
    const parcel = parcels[index * 3];
    const project = projects[(index * 3) % projects.length];
    const type = [
      'missing_document',
      'pending_verification',
      'pending_approval',
      'compensation',
      'overdue_milestone',
      'readiness',
    ][index % 6];
    return {
      _id: stableId('notification', padded(index + 1)),
      key: `local-demo:notification:${padded(index + 1)}`,
      type,
      severity: ['low', 'medium', 'high'][index % 3],
      title: `[SYNTHETIC DEMO] ${type.replaceAll('_', ' ')}`,
      message: 'Synthetic demonstration notification. It does not describe a real landholder, payment, or government action.',
      project: project._id,
      landParcel: parcel._id,
      resolvedAt: null,
      isDemo: true,
    };
  });

  const auditEntities = [
    ...users.map((record) => ({ entityType: 'User', record })),
    ...projects.map((record) => ({ entityType: 'Project', record })),
    ...parcels.map((record) => ({ entityType: 'LandParcel', record })),
    ...verifications.map((record) => ({ entityType: 'FieldVerification', record })),
    ...notifications.map((record) => ({ entityType: 'Notification', record })),
  ];
  const auditLogs = auditEntities.map(({ entityType, record }, index) => ({
    _id: stableId('audit-log', `${entityType}:${record._id}`),
    user: projectOfficerId,
    action: 'generated_demo',
    entityType,
    entityId: record._id,
    description: 'Synthetic demonstration record generated by the local seed; no real-world action occurred.',
    timestamp: daysFrom(now, -(auditEntities.length - index)),
    isDemo: true,
  }));

  return {
    users,
    projects,
    parcels,
    verifications,
    notifications,
    auditLogs,
  };
}

module.exports = { buildLocalDemoDataset, stableId };
