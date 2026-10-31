require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');
const LandParcel = require('../models/LandParcel');
const Notification = require('../models/Notification');
const Project = require('../models/Project');
const User = require('../models/User');
const { hashPassword } = require('../services/passwords');
const { buildLocalDemoDataset } = require('./localDemoDataset');

const confirmationValue = 'APPLY-LOCAL-BHOOMIDRISHTI-DEMO';

class SeedError extends Error {}

const collections = [
  { name: 'users', model: User, dataKey: 'users', identity: ['email'], uniqueFields: ['email'] },
  { name: 'projects', model: Project, dataKey: 'projects', identity: ['projectCode'], uniqueFields: ['projectCode'] },
  { name: 'landParcels', model: LandParcel, dataKey: 'parcels', identity: ['parcelCode', 'project', 'surveyNumber'], uniqueFields: ['parcelCode', 'surveyNumber'] },
  { name: 'fieldVerifications', model: FieldVerification, dataKey: 'verifications', identity: ['project', 'landParcel'] },
  { name: 'notifications', model: Notification, dataKey: 'notifications', identity: ['key'], uniqueFields: ['key'] },
  { name: 'auditLogs', model: AuditLog, dataKey: 'auditLogs', identity: ['user', 'action', 'entityType', 'entityId'] },
];

function resolveTarget(uri) {
  if (!uri) throw new SeedError('MONGO_URI is required.');
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new SeedError('MONGO_URI is invalid; its value has not been displayed.');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new SeedError('Seed blocked: the MongoDB host must be a local loopback address.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (databaseName !== 'bhoomidrishti') {
    throw new SeedError('Seed blocked: the database must be exactly "bhoomidrishti".');
  }
  if (parsed.protocol !== 'mongodb:') {
    throw new SeedError('Seed blocked: only a local mongodb:// URI is supported.');
  }
  return { host, databaseName };
}

function assertEnvironment({ apply, args }) {
  if (args.some((arg) => arg !== '--apply')) {
    throw new SeedError('Unknown argument. The only supported option is --apply; without it the command is read-only.');
  }
  if (process.env.NODE_ENV !== 'development') {
    throw new SeedError('Seed blocked: NODE_ENV must be exactly "development".');
  }
  const target = resolveTarget(process.env.MONGO_URI?.trim());
  if (apply && process.env.LOCAL_DEMO_SEED_CONFIRM !== confirmationValue) {
    throw new SeedError(`Apply blocked. Set LOCAL_DEMO_SEED_CONFIRM=${confirmationValue} only after reviewing the preview.`);
  }
  if (apply && (typeof process.env.DEMO_PASSWORD !== 'string'
    || process.env.DEMO_PASSWORD.length < 12
    || process.env.DEMO_PASSWORD.length > 1024)) {
    throw new SeedError('Apply blocked: securely provide DEMO_PASSWORD with 12–1024 characters.');
  }
  return target;
}

function sameValue(actual, expected) {
  return String(actual ?? '') === String(expected ?? '');
}

function identityMatches(existing, expected, identity) {
  return identity.every((field) => sameValue(existing[field], expected[field]));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findExistingRecords({ model, docs, identity }) {
  const ids = docs.map((doc) => doc._id);
  const idMatches = await model.find({ _id: { $in: ids } })
    .select('_id isDemo email projectCode parcelCode surveyNumber project landParcel key user action entityType entityId')
    .lean();
  const records = new Map(idMatches.map((record) => [String(record._id), record]));

  const collisionFilters = [];
  const uniqueFields = collections.find((collection) => collection.model === model)?.uniqueFields || [];
  for (const field of uniqueFields) {
    const values = [...new Set(docs.map((doc) => doc[field]).filter(Boolean))];
    if (field === 'surveyNumber') {
      collisionFilters.push({
        $or: values.map((value) => ({
          surveyNumber: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
        })),
      });
    } else {
      collisionFilters.push({ [field]: { $in: values } });
    }
  }

  if (collisionFilters.length) {
    const collisions = await model.find({ $or: collisionFilters })
      .select('_id isDemo email projectCode parcelCode surveyNumber project landParcel key user action entityType entityId')
      .lean();
    for (const record of collisions) records.set(String(record._id), record);
  }
  return records;
}

function summarizeCollection(collection, docs, existingRecords, conflicts) {
  let inserts = 0;
  let updates = 0;
  for (const expected of docs) {
    const existing = existingRecords.get(String(expected._id));
    if (!existing) {
      inserts += 1;
      continue;
    }
    if (existing.isDemo === true && identityMatches(existing, expected, collection.identity)) {
      updates += 1;
    } else {
      conflicts.push(`${collection.name}:${String(expected._id)}`);
    }
  }

  for (const existing of existingRecords.values()) {
    const expected = docs.find((doc) => collection.uniqueFields?.some((field) => (
      sameValue(doc[field], existing[field])
    )));
    if (!expected) continue;
    if (String(expected._id) !== String(existing._id)
      || existing.isDemo !== true
      || !identityMatches(existing, expected, collection.identity)) {
      conflicts.push(`${collection.name}:${String(existing._id)}`);
    }
  }

  return { records: docs.length, inserts, updates };
}

async function preflight(dataset) {
  const summaries = [];
  const conflicts = [];
  for (const collection of collections) {
    const docs = dataset[collection.dataKey];
    const existingRecords = await findExistingRecords({ ...collection, docs });
    summaries.push({
      name: collection.name,
      ...summarizeCollection(collection, docs, existingRecords, conflicts),
    });
  }

  const nonDemoCounts = await Promise.all([
    User.countDocuments({ isDemo: { $ne: true } }),
    Project.countDocuments({ isDemo: { $ne: true } }),
    LandParcel.countDocuments({ isDemo: { $ne: true } }),
    FieldVerification.countDocuments({ isDemo: { $ne: true } }),
    Notification.countDocuments({ isDemo: { $ne: true } }),
    AuditLog.countDocuments({ isDemo: { $ne: true } }),
  ]);
  return {
    summaries,
    conflicts: [...new Set(conflicts)],
    nonDemoCounts: Object.fromEntries(collections.map((collection, index) => [
      collection.name,
      nonDemoCounts[index],
    ])),
  };
}

function validatePlannedReferences(dataset) {
  const userById = new Map(dataset.users.map((record) => [record._id, record]));
  const projectById = new Map(dataset.projects.map((record) => [record._id, record]));
  const parcelById = new Map(dataset.parcels.map((record) => [record._id, record]));
  const verificationById = new Map(dataset.verifications.map((record) => [record._id, record]));
  const notificationById = new Map(dataset.notifications.map((record) => [record._id, record]));
  const fail = (message) => { throw new SeedError(`Synthetic relationship check failed: ${message}`); };

  for (const project of dataset.projects) {
    if (userById.get(project.createdBy)?.role !== 'project_officer') fail('project creator');
  }
  for (const parcel of dataset.parcels) {
    if (!projectById.has(parcel.project)) fail('parcel project');
    if (parcel.approval.approvedBy && userById.get(parcel.approval.approvedBy)?.role !== 'reviewer') {
      fail('parcel approver');
    }
  }
  for (const verification of dataset.verifications) {
    const project = projectById.get(verification.project);
    const parcel = parcelById.get(verification.landParcel);
    if (!project || !parcel || parcel.project !== project._id) fail('verification project/parcel');
    if (userById.get(verification.verifiedBy)?.role !== 'field_officer') fail('verification officer');
    if (verification.history?.some((item) => !userById.has(item.actor))) fail('verification history actor');
  }
  for (const notification of dataset.notifications) {
    if (!projectById.has(notification.project) || !parcelById.has(notification.landParcel)) {
      fail('notification project/parcel');
    }
  }
  for (const audit of dataset.auditLogs) {
    if (!userById.has(audit.user)) fail('audit actor');
    const targets = {
      User: userById,
      Project: projectById,
      LandParcel: parcelById,
      FieldVerification: verificationById,
      Notification: notificationById,
    };
    if (!targets[audit.entityType]?.has(audit.entityId)) fail('audit entity');
  }
}

function printPreview({ target, result, dataset, apply }) {
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (read-only; no records written)'}`);
  console.log(`Target: local MongoDB ${target.host}, database "${target.databaseName}"`);
  console.log(`Non-demo records preserved: ${Object.entries(result.nonDemoCounts).map(([name, count]) => `${name}=${count}`).join(', ')}`);
  console.log('Planned collection changes:');
  for (const item of result.summaries) {
    console.log(`  ${item.name}: ${item.records} total (${item.inserts} insert, ${item.updates} update)`);
  }
  console.log(`  unique embedded synthetic landholder profiles: ${new Set(dataset.parcels.map((parcel) => parcel.owner.name)).size}`);
  const verificationCounts = dataset.verifications.reduce((counts, item) => {
    counts[item.verificationStatus] += 1;
    return counts;
  }, { pending: 0, verified: 0, rejected: 0 });
  console.log(`Field verification status mix: ${JSON.stringify(verificationCounts)}`);
  console.log(`Conflicts: ${result.conflicts.length}`);
  if (result.conflicts.length) {
    for (const conflict of result.conflicts) console.log(`  ${conflict}`);
  }
  if (!apply && !result.conflicts.length) {
    console.log('Preview complete. This command did not insert, update, or delete records.');
  }
}

function toWriteOperation(collection, document) {
  const setValues = { ...document };
  delete setValues._id;
  const filter = {
    _id: document._id,
    isDemo: true,
    ...Object.fromEntries(collection.identity.map((field) => [field, document[field]])),
  };
  const update = {
    $set: setValues,
    $setOnInsert: { _id: document._id },
  };
  if (collection.model === Notification) {
    update.$unset = { resolvedBy: 1, resolutionReason: 1 };
  }
  return {
    updateOne: {
      filter,
      update,
      upsert: true,
    },
  };
}

async function applyDataset(dataset) {
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD);
  const data = {
    ...dataset,
    users: dataset.users.map((user) => ({ ...user, password: passwordHash })),
  };
  for (const collection of collections) {
    await collection.model.bulkWrite(
      data[collection.dataKey].map((document) => toWriteOperation(collection, document)),
      { ordered: true, runValidators: true },
    );
  }
}

async function verifyPersistedReferences(dataset) {
  const [users, projects, parcels, verifications, notifications, auditLogs] = await Promise.all([
    User.find({ _id: { $in: dataset.users.map((item) => item._id) } }).select('_id role isDemo').lean(),
    Project.find({ _id: { $in: dataset.projects.map((item) => item._id) } }).select('_id createdBy isDemo').lean(),
    LandParcel.find({ _id: { $in: dataset.parcels.map((item) => item._id) } }).select('_id project approval.approvedBy isDemo').lean(),
    FieldVerification.find({ _id: { $in: dataset.verifications.map((item) => item._id) } }).select('_id project landParcel verifiedBy history.actor isDemo').lean(),
    Notification.find({ _id: { $in: dataset.notifications.map((item) => item._id) } }).select('_id project landParcel isDemo').lean(),
    AuditLog.find({ _id: { $in: dataset.auditLogs.map((item) => item._id) } }).select('_id user entityType entityId isDemo').lean(),
  ]);
  const persisted = { users, projects, parcels, verifications, notifications, auditLogs };
  for (const collection of collections) {
    const records = persisted[collection.name === 'landParcels' ? 'parcels'
      : collection.name === 'fieldVerifications' ? 'verifications'
        : collection.name];
    if (records.length !== dataset[collection.dataKey].length || records.some((item) => item.isDemo !== true)) {
      throw new SeedError(`Post-write verification failed for ${collection.name}.`);
    }
  }

  const userById = new Map(users.map((item) => [String(item._id), item]));
  const projectById = new Map(projects.map((item) => [String(item._id), item]));
  const parcelById = new Map(parcels.map((item) => [String(item._id), item]));
  const verificationById = new Map(verifications.map((item) => [String(item._id), item]));
  const notificationById = new Map(notifications.map((item) => [String(item._id), item]));
  for (const project of projects) {
    if (userById.get(String(project.createdBy))?.role !== 'project_officer') throw new SeedError('Post-write project creator reference check failed.');
  }
  for (const parcel of parcels) {
    if (!projectById.has(String(parcel.project))) throw new SeedError('Post-write parcel project reference check failed.');
    if (parcel.approval?.approvedBy && userById.get(String(parcel.approval.approvedBy))?.role !== 'reviewer') {
      throw new SeedError('Post-write parcel approval reference check failed.');
    }
  }
  for (const verification of verifications) {
    const parcel = parcelById.get(String(verification.landParcel));
    if (!parcel || String(parcel.project) !== String(verification.project)
      || userById.get(String(verification.verifiedBy))?.role !== 'field_officer'
      || verification.history?.some((item) => !userById.has(String(item.actor)))) {
      throw new SeedError('Post-write field-verification reference check failed.');
    }
  }
  for (const notification of notifications) {
    if (!projectById.has(String(notification.project)) || !parcelById.has(String(notification.landParcel))) {
      throw new SeedError('Post-write notification reference check failed.');
    }
  }
  for (const log of auditLogs) {
    const targets = {
      User: userById,
      Project: projectById,
      LandParcel: parcelById,
      FieldVerification: verificationById,
      Notification: notificationById,
    };
    if (!userById.has(String(log.user)) || !targets[log.entityType]?.has(String(log.entityId))) {
      throw new SeedError('Post-write audit reference check failed.');
    }
  }
}

async function run({ args = process.argv.slice(2) } = {}) {
  const apply = args.includes('--apply');
  const target = assertEnvironment({ apply, args });
  const dataset = buildLocalDemoDataset();
  validatePlannedReferences(dataset);

  await connectDB();
  try {
    if (mongoose.connection.name !== target.databaseName) {
      throw new SeedError('Connected database does not match the approved local target.');
    }
    const result = await preflight(dataset);
    printPreview({ target, result, dataset, apply });
    if (result.conflicts.length) {
      throw new SeedError('Seed blocked because one or more records conflict with non-seed data; no records were written.');
    }
    if (!apply) return;

    await applyDataset(dataset);
    await verifyPersistedReferences(dataset);
    console.log('Seed write and post-write relationship verification completed.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch((error) => {
    if (error instanceof SeedError) {
      console.error(error.message);
    } else {
      const code = error?.code ? `, code ${error.code}` : '';
      console.error(`Local demo seed failed (${error?.name || 'Error'}${code}). Database credentials and record values were not logged.`);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  assertEnvironment,
  resolveTarget,
  run,
  validatePlannedReferences,
};
