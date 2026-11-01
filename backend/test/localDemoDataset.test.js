const assert = require('node:assert/strict');
const test = require('node:test');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const User = require('../models/User');
const { buildLocalDemoDataset } = require('../scripts/localDemoDataset');
const { assertEnvironment, resolveTarget, validatePlannedReferences } = require('../scripts/seedLocalDemo');

const now = new Date('2026-01-01T00:00:00.000Z');
const models = {
  users: User,
  projects: Project,
  parcels: LandParcel,
  verifications: FieldVerification,
  notifications: Notification,
  auditLogs: AuditLog,
};

test('builds a deterministic, complete demo dataset with expected record counts', () => {
  const first = buildLocalDemoDataset(now);
  const second = buildLocalDemoDataset(now);
  const expected = {
    users: 4,
    projects: 18,
    parcels: 180,
    verifications: 120,
    notifications: 40,
    auditLogs: 362,
  };

  for (const [collection, count] of Object.entries(expected)) {
    assert.equal(first[collection].length, count);
    assert.deepEqual(first[collection], second[collection]);
    assert.ok(first[collection].every((record) => record.isDemo === true));
    assert.equal(new Set(first[collection].map((record) => record._id)).size, count);
  }

  assert.equal(new Set(first.parcels.map((parcel) => parcel.owner.name)).size, 100);
  assert.equal(new Set(first.parcels.map((parcel) => parcel.surveyNumber)).size, 180);
  assert.ok(first.parcels.every((parcel) => parcel.surveyReferenceSource.includes('not an official survey')));
  assert.ok(first.projects.every((project) => project.name.startsWith('[SYNTHETIC DEMO]')));
  assert.ok(first.parcels.every((parcel) => parcel.location.village.startsWith('Synthetic Demo Village')));
  assert.ok(first.parcels.every((parcel) => parcel.location.address.includes('coordinates')));
  assert.ok(first.verifications.every((verification) => verification.remarks.includes('coordinates are synthetic')));
  assert.ok(first.parcels.every((parcel) => parcel.owner.contactNumber.startsWith('SYNTHETIC-NON-DELIVERABLE-')));
  assert.ok(first.notifications.every((notification) => notification.key.startsWith('local-demo:')));
  assert.ok(first.users.every((user) => !Object.hasOwn(user, 'password')));
});

test('all planned records satisfy existing Mongoose schemas and reference relationships', async () => {
  const dataset = buildLocalDemoDataset(now);
  validatePlannedReferences(dataset);
  for (const [collection, Model] of Object.entries(models)) {
    for (const record of dataset[collection]) {
      const doc = new Model({
        ...record,
        ...(collection === 'users' ? { password: 'scrypt$test$test' } : {}),
      });
      await doc.validate();
    }
  }
});

test('local seed target accepts only the exact local development database', () => {
  assert.deepEqual(
    resolveTarget('mongodb://127.0.0.1:27017/bhoomidrishti'),
    { host: '127.0.0.1', databaseName: 'bhoomidrishti' },
  );
  assert.deepEqual(
    resolveTarget('mongodb://localhost:27017/bhoomidrishti?authSource=admin'),
    { host: 'localhost', databaseName: 'bhoomidrishti' },
  );
  assert.throws(() => resolveTarget('mongodb://127.0.0.1:27017/bhoomidrishti_demo'), /must be exactly/);
  assert.throws(() => resolveTarget('mongodb://example.invalid/bhoomidrishti'), /local loopback/);
  assert.throws(() => resolveTarget('mongodb+srv://localhost/bhoomidrishti'), /mongodb:\/\/ URI/);
});

test('seed writes require explicit apply confirmation and a valid secure password value', () => {
  const keys = ['NODE_ENV', 'MONGO_URI', 'LOCAL_DEMO_SEED_CONFIRM', 'DEMO_PASSWORD'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.NODE_ENV = 'development';
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/bhoomidrishti';
    delete process.env.LOCAL_DEMO_SEED_CONFIRM;
    delete process.env.DEMO_PASSWORD;

    assert.doesNotThrow(() => assertEnvironment({ apply: false, args: [] }));
    assert.throws(() => assertEnvironment({ apply: true, args: ['--apply'] }), /Apply blocked/);

    process.env.LOCAL_DEMO_SEED_CONFIRM = 'APPLY-LOCAL-BHOOMIDRISHTI-DEMO';
    assert.throws(() => assertEnvironment({ apply: true, args: ['--apply'] }), /securely provide DEMO_PASSWORD/);
    process.env.DEMO_PASSWORD = 'x'.repeat(12);
    assert.doesNotThrow(() => assertEnvironment({ apply: true, args: ['--apply'] }));
    assert.throws(() => assertEnvironment({ apply: false, args: ['--unexpected'] }), /Unknown argument/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
