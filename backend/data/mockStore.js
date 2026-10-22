const userAdmin = {
  _id: 'user_admin_1',
  name: 'Central Admin',
  email: 'admin@gov.in',
  password: 'demo123',
  role: 'admin',
  department: 'Land Acquisition',
  createdAt: new Date('2024-01-12T09:00:00.000Z'),
  updatedAt: new Date('2024-01-12T09:00:00.000Z'),
};

const projectOne = {
  _id: 'project_1',
  name: 'Saharpur Ring Road Expansion',
  description: 'State highway widening and utility relocation project',
  projectType: 'Highway',
  department: 'National Highways Authority',
  location: 'Saharpur, Uttar Pradesh',
  status: 'in_progress',
  startDate: '2024-02-10T00:00:00.000Z',
  expectedEndDate: '2025-02-10T00:00:00.000Z',
  createdBy: userAdmin._id,
  milestones: [
    { name: 'Survey approval', dueDate: '2024-03-10T00:00:00.000Z', status: 'completed' },
    { name: 'Land notification', dueDate: '2024-06-15T00:00:00.000Z', status: 'in_progress' },
  ],
  createdAt: new Date('2024-02-10T00:00:00.000Z'),
  updatedAt: new Date('2024-05-12T00:00:00.000Z'),
};

const projectTwo = {
  _id: 'project_2',
  name: 'Nawada Canal Rehabilitation',
  description: 'Canal widening with community resettlement planning',
  projectType: 'Irrigation',
  department: 'Water Resources Department',
  location: 'Nawada, Bihar',
  status: 'planning',
  startDate: '2024-04-01T00:00:00.000Z',
  expectedEndDate: '2025-09-30T00:00:00.000Z',
  createdBy: userAdmin._id,
  milestones: [
    { name: 'Initial demarcation', dueDate: '2024-05-10T00:00:00.000Z', status: 'pending' },
  ],
  createdAt: new Date('2024-04-01T00:00:00.000Z'),
  updatedAt: new Date('2024-04-01T00:00:00.000Z'),
};

const landParcelOne = {
  _id: 'parcel_1',
  project: projectOne._id,
  surveyNumber: '121/2A',
  area: 3.4,
  areaUnit: 'acres',
  location: {
    latitude: 28.6139,
    longitude: 77.209,
    address: 'Village Saharpur, Tehsil Ghaziabad',
    village: 'Saharpur',
    taluk: 'Ghaziabad',
    district: 'Ghaziabad',
    state: 'Uttar Pradesh',
  },
  landType: 'Agricultural',
  acquisitionStatus: 'verified',
  owner: {
    name: 'Ramesh Kumar',
    contactNumber: '+91 9876543210',
    address: 'Ward 4, Saharpur',
  },
  compensation: {
    estimatedAmount: 1250000,
    approvedAmount: 1185000,
    paidAmount: 1185000,
    status: 'paid',
    paymentDate: '2024-05-12T00:00:00.000Z',
  },
  rehabilitation: {
    required: true,
    status: 'completed',
    details: 'Resettlement support and crop loss reimbursement issued',
  },
  approval: {
    status: 'approved',
    approvedBy: userAdmin._id,
    approvedAt: '2024-05-12T00:00:00.000Z',
    remarks: 'Approved by district collector',
  },
  documents: [
    { name: 'Title deed', type: 'PDF', url: '/docs/title-deed-1.pdf', uploadedAt: '2024-04-21T00:00:00.000Z' },
  ],
  createdAt: new Date('2024-03-15T00:00:00.000Z'),
  updatedAt: new Date('2024-05-12T00:00:00.000Z'),
};

const landParcelTwo = {
  _id: 'parcel_2',
  project: projectOne._id,
  surveyNumber: '88/7A',
  area: 2.1,
  areaUnit: 'acres',
  location: {
    latitude: 28.6211,
    longitude: 77.2062,
    address: 'Village Naya Gaon, Tehsil Ghaziabad',
    village: 'Naya Gaon',
    taluk: 'Ghaziabad',
    district: 'Ghaziabad',
    state: 'Uttar Pradesh',
  },
  landType: 'Residential',
  acquisitionStatus: 'compensation_pending',
  owner: {
    name: 'Meena Devi',
    contactNumber: '+91 9123456780',
    address: 'Naya Gaon, Ghaziabad',
  },
  compensation: {
    estimatedAmount: 980000,
    approvedAmount: 940000,
    paidAmount: 0,
    status: 'pending',
    paymentDate: null,
  },
  rehabilitation: {
    required: false,
    status: 'not_required',
    details: 'No eviction assistance needed',
  },
  approval: {
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    remarks: 'Awaiting final arbitration review',
  },
  documents: [],
  createdAt: new Date('2024-03-19T00:00:00.000Z'),
  updatedAt: new Date('2024-05-08T00:00:00.000Z'),
};

const fieldVerificationOne = {
  _id: 'verification_1',
  project: projectOne._id,
  landParcel: landParcelOne._id,
  verifiedBy: userAdmin._id,
  verificationStatus: 'verified',
  remarks: 'Boundary markers match cadastral records and site conditions.',
  location: {
    latitude: 28.6139,
    longitude: 77.209,
  },
  photos: [
    { url: '/photos/site-1.jpg', capturedAt: '2024-04-24T12:15:00.000Z' },
  ],
  verifiedAt: '2024-04-24T12:15:00.000Z',
  createdAt: new Date('2024-04-24T12:15:00.000Z'),
  updatedAt: new Date('2024-04-24T12:15:00.000Z'),
};

const store = {
  users: [userAdmin],
  projects: [projectOne, projectTwo],
  landParcels: [landParcelOne, landParcelTwo],
  fieldVerifications: [fieldVerificationOne],
};

module.exports = {
  store,
  getUserById: (id) => store.users.find((user) => String(user._id) === String(id)),
  getProjectById: (id) => store.projects.find((project) => String(project._id) === String(id)),
  getLandParcelById: (id) => store.landParcels.find((parcel) => String(parcel._id) === String(id)),
  createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
};
