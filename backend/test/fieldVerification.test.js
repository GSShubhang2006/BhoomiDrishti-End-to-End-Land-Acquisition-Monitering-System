const assert = require('node:assert/strict');
const { test } = require('node:test');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');
const { canTransition, updateFieldVerification } = require('../controllers/fieldVerificationController');

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('field verification status transitions only move pending records to a final outcome', () => {
  assert.equal(canTransition('pending', 'verified'), true);
  assert.equal(canTransition('pending', 'rejected'), true);
  assert.equal(canTransition('pending', 'pending'), false);
  assert.equal(canTransition('verified', 'pending'), true);
  assert.equal(canTransition('rejected', 'pending'), true);
  assert.equal(canTransition('verified', 'rejected'), false);
  assert.equal(canTransition('rejected', 'verified'), false);
  assert.equal(canTransition('unknown', 'verified'), false);
});

test('final field verification outcomes cannot be changed', async () => {
  const originalFindById = FieldVerification.findById;
  const originalAuditCreate = AuditLog.create;
  let saved = false;
  FieldVerification.findById = async () => ({
    verificationStatus: 'verified',
    save: async () => { saved = true; },
  });
  AuditLog.create = async () => ({});
  const response = createResponse();
  try {
    await updateFieldVerification(
      { params: { id: '672000000000000000000001' }, body: { verificationStatus: 'rejected' }, user: { role: 'admin' } },
      response,
    );
  } finally {
    FieldVerification.findById = originalFindById;
    AuditLog.create = originalAuditCreate;
  }
  assert.equal(response.statusCode, 409);
  assert.equal(saved, false);
});

test('completing a pending field verification records its outcome history', async () => {
  const originalFindById = FieldVerification.findById;
  const originalAuditCreate = AuditLog.create;
  const verification = {
    _id: '672000000000000000000001',
    verificationStatus: 'pending',
    verifiedBy: '672000000000000000000002',
    history: [],
    async save() {},
    async populate() { return this; },
  };
  FieldVerification.findById = async () => verification;
  AuditLog.create = async () => ({});
  const response = createResponse();
  try {
    await updateFieldVerification(
      { params: { id: verification._id }, body: { verificationStatus: 'verified', remarks: 'Inspection completed' }, user: { _id: '672000000000000000000002', role: 'admin' } },
      response,
    );
  } finally {
    FieldVerification.findById = originalFindById;
    AuditLog.create = originalAuditCreate;
  }
  assert.equal(response.statusCode, 200);
  assert.equal(verification.verificationStatus, 'verified');
  assert.equal(verification.history.length, 1);
  assert.equal(verification.history[0].action, 'verified');
  assert.equal(verification.history[0].remarks, 'Inspection completed');
});

test('reopening a final field verification preserves the prior outcome in history', async () => {
  const originalFindById = FieldVerification.findById;
  const originalAuditCreate = AuditLog.create;
  const verification = {
    _id: '672000000000000000000001',
    verificationStatus: 'rejected',
    verifiedBy: '672000000000000000000002',
    history: [],
    async save() {},
    async populate() { return this; },
  };
  FieldVerification.findById = async () => verification;
  AuditLog.create = async () => ({});
  const response = createResponse();
  try {
    await updateFieldVerification(
      { params: { id: verification._id }, body: { verificationStatus: 'pending', remarks: 'Additional evidence requested' }, user: { _id: '672000000000000000000002', role: 'admin' } },
      response,
    );
  } finally {
    FieldVerification.findById = originalFindById;
    AuditLog.create = originalAuditCreate;
  }
  assert.equal(response.statusCode, 200);
  assert.equal(verification.verificationStatus, 'pending');
  assert.equal(verification.history[0].action, 'reopened');
});
