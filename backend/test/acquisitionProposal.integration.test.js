const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const AcquisitionProposal = require('../models/AcquisitionProposal');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const Session = require('../models/Session');
const User = require('../models/User');
const { hashPassword } = require('../services/passwords');
const { tokenDigest } = require('../middleware/authentication');

process.env.NODE_ENV = 'test';

const databaseName = `bhoomidrishti_proposal_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mongoUrl = new URL(process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017');
mongoUrl.pathname = `/${databaseName}`;
const mongoUri = mongoUrl.toString();
const password = 'proposal-test-password-only';
const emailSuffix = crypto.randomBytes(6).toString('hex');
const users = {};
const cookies = {};
const userIds = [];
const projectIds = [];
const proposalIds = [];
const { app } = require('../server');
let server;
let baseUrl;
let project;
let archivedProject;

before(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([AcquisitionProposal.init(), Notification.init(), AuditLog.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  for (const role of ['admin', 'project_officer', 'reviewer', 'reviewer', 'viewer', 'field_officer']) {
    const user = await User.create({
      name: `Proposal ${role} ${userIds.length}`,
      email: `proposal-${role}-${userIds.length}-${emailSuffix}@example.invalid`,
      password: await hashPassword(password),
      role,
      department: 'Public Works Department',
    });
    users[`${role}${role === 'reviewer' && users.reviewer ? '2' : ''}`] = user;
    userIds.push(user._id);
    const token = crypto.randomBytes(32).toString('base64url');
    await Session.create({ tokenHash: tokenDigest(token), user: user._id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
    cookies[`${role}${role === 'reviewer' && Object.keys(cookies).some((key) => key.startsWith('reviewer')) ? '2' : ''}`] = `bhoomidrishti_session=${encodeURIComponent(token)}`;
  }
  project = await Project.create({
    name: 'Proposal Integration Project',
    projectCode: `PIT-${emailSuffix}`,
    department: 'Public Works Department',
    location: 'Test District',
    createdBy: users.project_officer._id,
  });
  projectIds.push(project._id);
  archivedProject = await Project.create({
    name: 'Archived Proposal Integration Project',
    projectCode: `PIT-ARCH-${emailSuffix}`,
    department: 'Public Works Department',
    location: 'Test District',
    createdBy: users.project_officer._id,
    archivedAt: new Date(),
  });
  projectIds.push(archivedProject._id);
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (mongoose.connection.readyState === 1) {
    const testNotifications = await Notification.find({ proposal: { $in: proposalIds } }).select('_id').lean();
    const notificationIds = testNotifications.map((item) => item._id);
    await AuditLog.deleteMany({ entityId: { $in: [...proposalIds, ...notificationIds] } });
    await Notification.deleteMany({ proposal: { $in: proposalIds } });
    await AcquisitionProposal.deleteMany({ _id: { $in: proposalIds } });
    await Project.deleteMany({ _id: { $in: projectIds } });
    await Session.deleteMany({ user: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    assert.equal(await AcquisitionProposal.countDocuments({ _id: { $in: proposalIds } }), 0);
    assert.equal(await Project.countDocuments({ _id: { $in: projectIds } }), 0);
    assert.equal(await User.countDocuments({ _id: { $in: userIds } }), 0);
  }
  await mongoose.disconnect();
});

async function request(endpoint, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const proposalInput = (overrides = {}) => ({
  title: 'Test acquisition proposal',
  description: 'Clearly identified synthetic proposal used only for isolated integration tests.',
  purpose: 'Validate acquisition proposal workflow routes.',
  department: 'Public Works Department',
  location: { state: 'Karnataka', district: 'Test District', taluk: 'Test Taluk', village: 'Test Village' },
  proposedArea: 12.5,
  areaUnit: 'acres',
  proposedParcels: [{ surveyReference: 'TEST-SURVEY-001', area: 12.5, areaUnit: 'acres', location: { village: 'Test Village' } }],
  ...overrides,
});

async function createProposal(cookie, input = proposalInput()) {
  const response = await request('/acquisition-proposals', { method: 'POST', cookie, body: input });
  const body = await response.json();
  if (response.status === 201) proposalIds.push(body.proposal._id);
  return { response, body };
}

test('proposal routes enforce authentication, role limits, and opaque object access', async () => {
  const unauthenticated = await request('/acquisition-proposals');
  assert.equal(unauthenticated.status, 401);

  const fieldList = await request('/acquisition-proposals', { cookie: cookies.field_officer });
  assert.equal(fieldList.status, 403);
  const viewerCreate = await createProposal(cookies.viewer);
  assert.equal(viewerCreate.response.status, 403);

  const invalidId = await request('/acquisition-proposals/not-an-id', { cookie: cookies.project_officer });
  assert.equal(invalidId.status, 400);
});

test('proposal page load endpoints resolve and return empty or authorized project/reviewer data', async () => {
  const [proposalResponse, projectResponse, parcelResponse, reviewerResponse] = await Promise.all([
    request('/acquisition-proposals?page=1&limit=20', { cookie: cookies.project_officer }),
    request('/projects', { cookie: cookies.project_officer }),
    request('/land-parcels', { cookie: cookies.project_officer }),
    request('/acquisition-proposals/reviewers', { cookie: cookies.project_officer }),
  ]);
  assert.equal(proposalResponse.status, 200);
  const proposalBody = await proposalResponse.json();
  assert.deepEqual(proposalBody.proposals, []);
  assert.equal(proposalBody.pagination.total, 0);

  assert.equal(projectResponse.status, 200);
  const projectBody = await projectResponse.json();
  assert.ok(projectBody.projects.some((item) => String(item._id) === String(project._id)));

  assert.equal(parcelResponse.status, 200);
  assert.deepEqual((await parcelResponse.json()).landParcels, []);

  assert.equal(reviewerResponse.status, 200);
  const reviewerBody = await reviewerResponse.json();
  assert.ok(reviewerBody.reviewers.some((item) => String(item._id) === String(users.reviewer._id)));
  assert.equal(Object.hasOwn(reviewerBody.reviewers[0], 'email'), false);
  assert.equal(Object.hasOwn(reviewerBody.reviewers[0], 'password'), false);

  const reviewerForbidden = await request('/acquisition-proposals/reviewers', { cookie: cookies.reviewer });
  assert.equal(reviewerForbidden.status, 403);
});

test('draft creation validates fields, generates server IDs, and does not create project records', async () => {
  const beforeProjects = await Project.countDocuments({});
  const { response, body } = await createProposal(cookies.project_officer);
  assert.equal(response.status, 201);
  assert.match(body.proposal.proposalNumber, /^ACQ-\d{4}-[A-F0-9]{24}$/);
  assert.equal(body.proposal.status, 'draft');
  assert.equal(body.proposal.project, null);
  assert.equal(await Project.countDocuments({}), beforeProjects);
  const detail = await request(`/acquisition-proposals/${body.proposal._id}`, { cookie: cookies.project_officer });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).proposal.proposalNumber, body.proposal.proposalNumber);
  await assert.rejects(
    AcquisitionProposal.create({
      ...proposalInput(),
      proposalNumber: body.proposal.proposalNumber,
      createdBy: users.project_officer._id,
    }),
    (error) => error.code === 11000,
  );

  const second = await createProposal(cookies.project_officer, proposalInput({ title: 'Another distinct proposal' }));
  assert.equal(second.response.status, 201);
  assert.notEqual(second.body.proposal.proposalNumber, body.proposal.proposalNumber);

  const beforeProposals = await AcquisitionProposal.countDocuments({});
  const missingRequired = await createProposal(cookies.project_officer, proposalInput({ title: '' }));
  assert.equal(missingRequired.response.status, 400);
  const invalidArea = await createProposal(cookies.project_officer, proposalInput({ proposedArea: -1 }));
  assert.equal(invalidArea.response.status, 400);
  const clientNumber = await createProposal(cookies.project_officer, proposalInput({ proposalNumber: 'CLIENT-SUPPLIED' }));
  assert.equal(clientNumber.response.status, 400);
  const invalidProject = await createProposal(cookies.project_officer, proposalInput({ project: 'not-an-object-id' }));
  assert.equal(invalidProject.response.status, 400);
  const missingProject = await createProposal(cookies.project_officer, proposalInput({ project: new mongoose.Types.ObjectId().toString() }));
  assert.equal(missingProject.response.status, 400);
  assert.equal(await AcquisitionProposal.countDocuments({}), beforeProposals);
});

test('draft editing is allow-listed and proposal/project parcel associations are validated', async () => {
  const { body } = await createProposal(cookies.project_officer);
  const proposalId = body.proposal._id;
  const edited = await request(`/acquisition-proposals/${proposalId}`, {
    method: 'PUT',
    cookie: cookies.project_officer,
    body: { title: 'Updated synthetic proposal' },
  });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).proposal.title, 'Updated synthetic proposal');

  const massAssignment = await request(`/acquisition-proposals/${proposalId}`, {
    method: 'PUT',
    cookie: cookies.project_officer,
    body: { status: 'approved', title: 'Attempted state override' },
  });
  assert.equal(massAssignment.status, 400);
  const otherOfficer = await request(`/acquisition-proposals/${proposalId}`, {
    method: 'PUT',
    cookie: cookies.admin,
    body: { title: 'Admin can edit a draft' },
  });
  assert.equal(otherOfficer.status, 200);

  const invalidParcelAssociation = await request('/acquisition-proposals', {
    method: 'POST',
    cookie: cookies.project_officer,
    body: proposalInput({ proposedParcels: [{ surveyReference: 'UNLINKED', area: 1, areaUnit: 'acres', landParcel: new mongoose.Types.ObjectId() }] }),
  });
  assert.equal(invalidParcelAssociation.status, 400);

  const reviewerCannotGuess = await request(`/acquisition-proposals/${proposalId}`, { cookie: cookies.reviewer });
  assert.equal(reviewerCannotGuess.status, 404);
});

test('submission, reviewer assignment, change request, resubmission, approval, linking, audit and targeted notifications work', async () => {
  const { body: created } = await createProposal(cookies.admin);
  const proposalId = created.proposal._id;

  const submit = await request(`/acquisition-proposals/${proposalId}/submit`, { method: 'POST', cookie: cookies.admin });
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).proposal.status, 'submitted');
  assert.ok(await Notification.exists({ proposal: proposalId, type: 'proposal_submitted', recipients: users.admin._id }));

  const assignment = await request(`/acquisition-proposals/${proposalId}/assign-reviewer`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { reviewerId: users.reviewer._id },
  });
  assert.equal(assignment.status, 200);
  assert.equal((await assignment.json()).proposal.status, 'under_review');
  assert.ok(await Notification.exists({ proposal: proposalId, type: 'proposal_assigned', recipients: users.reviewer._id }));

  const assignedReviewerRead = await request(`/acquisition-proposals/${proposalId}`, { cookie: cookies.reviewer });
  assert.equal(assignedReviewerRead.status, 200);
  assert.equal((await assignedReviewerRead.json()).proposal.status, 'under_review');

  const unauthorizedApproval = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer2,
    body: { action: 'approve', remarks: 'An unassigned reviewer must not approve this proposal.' },
  });
  assert.equal(unauthorizedApproval.status, 404);

  const missingRemarks = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer,
    body: { action: 'approve', remarks: '  ' },
  });
  assert.equal(missingRemarks.status, 400);

  const requestChanges = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer,
    body: { action: 'request_changes', remarks: 'Please provide the missing location details.' },
  });
  assert.equal(requestChanges.status, 200);
  assert.equal((await requestChanges.json()).proposal.status, 'changes_requested');

  const revise = await request(`/acquisition-proposals/${proposalId}`, {
    method: 'PUT',
    cookie: cookies.admin,
    body: { description: 'Updated after the requested corrections; still synthetic test data.' },
  });
  assert.equal(revise.status, 200);
  const resubmit = await request(`/acquisition-proposals/${proposalId}/submit`, { method: 'POST', cookie: cookies.admin });
  assert.equal(resubmit.status, 200);
  const reassign = await request(`/acquisition-proposals/${proposalId}/assign-reviewer`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { reviewerId: users.reviewer._id },
  });
  assert.equal(reassign.status, 200);
  const approve = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer,
    body: {
      action: 'approve',
      remarks: 'The submitted proposal details have been reviewed. The proposed acquisition area and supporting parcel descriptions are accepted for this demonstration. Approved for the next stage of the acquisition workflow.',
    },
  });
  assert.equal(approve.status, 200);
  const approvedProposal = (await approve.json()).proposal;
  assert.equal(approvedProposal.status, 'approved');
  assert.equal(approvedProposal.decisionRemarks, 'The submitted proposal details have been reviewed. The proposed acquisition area and supporting parcel descriptions are accepted for this demonstration. Approved for the next stage of the acquisition workflow.');
  assert.ok(approvedProposal.reviewHistory.some((event) => (
    event.actor.toString() === users.reviewer._id.toString()
      && event.action === 'approved'
      && event.remarks === approvedProposal.decisionRemarks
  )));

  assert.ok(await Notification.exists({
    proposal: proposalId,
    type: 'proposal_approved',
    recipients: users.reviewer._id,
    message: { $regex: approvedProposal.decisionRemarks.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
  }));
  const approvalAudit = await AuditLog.findOne({ entityType: 'AcquisitionProposal', entityId: proposalId, action: 'approved' }).lean();
  assert.ok(approvalAudit);
  assert.equal(approvalAudit.user.toString(), users.reviewer._id.toString());
  assert.ok(approvalAudit.description.includes(approvedProposal.decisionRemarks));

  const invalidProjectId = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { projectId: 'invalid-project-id' },
  });
  assert.equal(invalidProjectId.status, 400);
  const missingProject = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { projectId: new mongoose.Types.ObjectId().toString() },
  });
  assert.equal(missingProject.status, 400);
  const archivedProjectLink = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { projectId: archivedProject._id },
  });
  assert.equal(archivedProjectLink.status, 409);
  const unauthorizedProjectLink = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.reviewer,
    body: { projectId: project._id },
  });
  assert.equal(unauthorizedProjectLink.status, 403);

  const beforeProjectCount = await Project.countDocuments({});
  const link = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { projectId: project._id },
  });
  assert.equal(link.status, 200);
  assert.equal((await link.json()).proposal.project.toString(), project._id.toString());
  assert.equal(await Project.countDocuments({}), beforeProjectCount);

  const duplicateLink = await request(`/acquisition-proposals/${proposalId}/link-project`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { projectId: project._id },
  });
  assert.equal(duplicateLink.status, 409);
  const linkedDetail = await request(`/acquisition-proposals/${proposalId}`, { cookie: cookies.admin });
  assert.equal(linkedDetail.status, 200);
  assert.equal((await linkedDetail.json()).proposal.project._id.toString(), project._id.toString());

  const proposalAudits = await AuditLog.find({ entityType: 'AcquisitionProposal', entityId: proposalId }).lean();
  assert.ok(proposalAudits.some((item) => item.action === 'created'));
  assert.ok(proposalAudits.some((item) => item.action === 'submitted'));
  assert.ok(proposalAudits.some((item) => item.action === 'approved'));
  assert.ok(proposalAudits.some((item) => item.action === 'project_linked'));

  const viewerNotifications = await request('/notifications', { cookie: cookies.viewer });
  assert.equal(viewerNotifications.status, 200);
  assert.equal((await viewerNotifications.json()).notifications.some((item) => String(item.proposal?._id) === String(proposalId)), false);
  const reviewerNotifications = await request('/notifications', { cookie: cookies.reviewer });
  assert.equal((await reviewerNotifications.json()).notifications.some((item) => String(item.proposal?._id) === String(proposalId)), true);
});

test('self-approval is blocked while permitted admin review actions and withdrawal remain available', async () => {
  const { body: created } = await createProposal(cookies.admin);
  const proposalId = created.proposal._id;
  await request(`/acquisition-proposals/${proposalId}/submit`, { method: 'POST', cookie: cookies.admin });
  await request(`/acquisition-proposals/${proposalId}/assign-reviewer`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { reviewerId: users.reviewer2._id },
  });
  const selfReview = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { action: 'approve', remarks: 'Attempted self-review must be blocked.' },
  });
  assert.equal(selfReview.status, 403);

  const selfRequestChanges = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { action: 'request_changes', remarks: 'Self-originated proposals may be returned for changes.' },
  });
  assert.equal(selfRequestChanges.status, 200);
  assert.equal((await selfRequestChanges.json()).proposal.status, 'changes_requested');

  const adminReviewProposal = await createProposal(cookies.project_officer);
  const adminReviewId = adminReviewProposal.body.proposal._id;
  await request(`/acquisition-proposals/${adminReviewId}/submit`, { method: 'POST', cookie: cookies.project_officer });
  await request(`/acquisition-proposals/${adminReviewId}/assign-reviewer`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { reviewerId: users.reviewer._id },
  });
  const adminApproval = await request(`/acquisition-proposals/${adminReviewId}/review`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { action: 'approve', remarks: 'Admin can review a proposal they did not create or submit.' },
  });
  assert.equal(adminApproval.status, 200);
  assert.equal((await adminApproval.json()).proposal.status, 'approved');

  const projectOfficerReview = await request(`/acquisition-proposals/${adminReviewId}/review`, {
    method: 'POST',
    cookie: cookies.project_officer,
    body: { action: 'reject', remarks: 'Project officers are not proposal reviewers.' },
  });
  assert.equal(projectOfficerReview.status, 403);
  const viewerReview = await request(`/acquisition-proposals/${adminReviewId}/review`, {
    method: 'POST',
    cookie: cookies.viewer,
    body: { action: 'reject', remarks: 'Viewers are not proposal reviewers.' },
  });
  assert.equal(viewerReview.status, 403);

  const unassignedReviewer = await request(`/acquisition-proposals/${adminReviewId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer2,
    body: { action: 'reject', remarks: 'Unassigned reviewers cannot review this proposal.' },
  });
  assert.equal(unassignedReviewer.status, 404);

  const draft = await createProposal(cookies.project_officer);
  const draftId = draft.body.proposal._id;
  const withdraw = await request(`/acquisition-proposals/${draftId}/withdraw`, { method: 'POST', cookie: cookies.project_officer });
  assert.equal(withdraw.status, 200);
  assert.equal((await withdraw.json()).proposal.status, 'withdrawn');

  const submitted = await createProposal(cookies.project_officer);
  const submittedId = submitted.body.proposal._id;
  await request(`/acquisition-proposals/${submittedId}/submit`, { method: 'POST', cookie: cookies.project_officer });
  const withdrawSubmitted = await request(`/acquisition-proposals/${submittedId}/withdraw`, { method: 'POST', cookie: cookies.project_officer });
  assert.equal(withdrawSubmitted.status, 200);
  assert.equal((await withdrawSubmitted.json()).proposal.status, 'withdrawn');
});

test('rejection is a terminal review decision and list filters are paginated', async () => {
  const { body: created } = await createProposal(cookies.project_officer);
  const proposalId = created.proposal._id;
  await request(`/acquisition-proposals/${proposalId}/submit`, { method: 'POST', cookie: cookies.project_officer });
  await request(`/acquisition-proposals/${proposalId}/assign-reviewer`, {
    method: 'POST',
    cookie: cookies.admin,
    body: { reviewerId: users.reviewer2._id },
  });
  const reject = await request(`/acquisition-proposals/${proposalId}/review`, {
    method: 'POST',
    cookie: cookies.reviewer2,
    body: { action: 'reject', remarks: 'Rejected only as part of the isolated integration test.' },
  });
  assert.equal(reject.status, 200);
  assert.equal((await reject.json()).proposal.status, 'rejected');

  const list = await request('/acquisition-proposals?status=rejected&page=1&limit=1', { cookie: cookies.admin });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.ok(listBody.proposals.length <= 1);
  assert.equal(listBody.pagination.page, 1);
  assert.ok(listBody.pagination.total >= 1);
  const search = await request(`/acquisition-proposals?q=${encodeURIComponent(created.proposal.proposalNumber)}&department=${encodeURIComponent(created.proposal.department)}&page=1&limit=10`, { cookie: cookies.admin });
  assert.equal(search.status, 200);
  assert.equal((await search.json()).proposals.some((item) => String(item._id) === String(proposalId)), true);
  const invalidFilter = await request('/acquisition-proposals?project=bad-id', { cookie: cookies.admin });
  assert.equal(invalidFilter.status, 400);
});
