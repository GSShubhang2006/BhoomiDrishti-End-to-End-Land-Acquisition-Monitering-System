const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { hashPassword } = require('../services/passwords');
const { tokenDigest } = require('../middleware/authentication');

process.env.NODE_ENV = 'test';

const databaseName = `bhoomidrishti_auth_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const mongoUrl = new URL(process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017');
mongoUrl.pathname = `/${databaseName}`;
const mongoUri = mongoUrl.toString();
const password = 'only-for-authentication-integration-tests';
const email = `auth-test-${crypto.randomBytes(6).toString('hex')}@example.invalid`;
const bootstrapEmail = `bootstrap-test-${crypto.randomBytes(6).toString('hex')}@example.invalid`;
const userIds = [];
const sessionIds = [];
const notificationIds = [];
const { app } = require('../server');
let server;
let baseUrl;

before(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const user = await User.create({
    name: 'Authentication Integration Test',
    email: email.toUpperCase(),
    password: await hashPassword(password),
    role: 'viewer',
  });
  userIds.push(user._id);

  const demoUser = await User.create({
    name: 'Development Demo Integration Test',
    email: `demo-${email}`,
    password: await hashPassword(password),
    role: 'viewer',
    isDemo: true,
  });
  userIds.push(demoUser._id);
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (mongoose.connection.readyState === 1) {
    if (notificationIds.length) {
      await AuditLog.deleteMany({ entityId: { $in: notificationIds } });
      await Notification.deleteMany({ _id: { $in: notificationIds } });
    }
    if (sessionIds.length) await Session.deleteMany({ _id: { $in: sessionIds } });
    if (userIds.length) await Session.deleteMany({ user: { $in: userIds } });
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } });
    const bootstrapUser = await User.findOne({ email: bootstrapEmail }).select('_id');
    if (bootstrapUser) {
      await Session.deleteMany({ user: bootstrapUser._id });
      await User.deleteOne({ _id: bootstrapUser._id });
    }
  }
  await mongoose.disconnect();
});

async function request(endpoint, { method = 'GET', body, cookie, rawBody } = {}) {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: rawBody === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : rawBody,
  });
}

test('valid credentials create a session, protect APIs, and logout revokes access', async () => {
  const response = await request('/auth/login', {
    method: 'POST',
    body: { email: `  ${email.toUpperCase()}  `, password },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.email, email);
  assert.equal(body.user.role, 'viewer');
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  assert.equal(Object.hasOwn(body.user, 'password'), false);

  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\/api/);
  const cookie = setCookie.split(';', 1)[0];

  const session = await Session.findOne({ user: body.user.id });
  assert.ok(session);
  sessionIds.push(session._id);

  const protectedResponse = await request('/auth/me', { cookie });
  assert.equal(protectedResponse.status, 200);
  assert.equal((await protectedResponse.json()).user.email, email);

  const logoutResponse = await request('/auth/logout', { method: 'POST', cookie });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(await Session.exists({ _id: session._id }), null);

  const afterLogout = await request('/auth/me', { cookie });
  assert.equal(afterLogout.status, 401);
});

test('incorrect passwords and unknown emails are rejected', async () => {
  const incorrectPassword = await request('/auth/login', {
    method: 'POST',
    body: { email, password: 'wrong-test-password' },
  });
  assert.equal(incorrectPassword.status, 401);

  const unknownEmail = await request('/auth/login', {
    method: 'POST',
    body: { email: 'missing-user@example.invalid', password },
  });
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await unknownEmail.json(), await incorrectPassword.json());
});

test('missing credentials and malformed JSON receive client errors', async () => {
  for (const body of [{ password }, { email }]) {
    const response = await request('/auth/login', { method: 'POST', body });
    assert.equal(response.status, 400);
  }

  const malformed = await request('/auth/login', { method: 'POST', rawBody: '{"email":' });
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).message, /invalid JSON/i);
});

test('expired and invalid sessions cannot access protected APIs', async () => {
  const token = 'expired-integration-session';
  const session = await Session.create({
    user: userIds[0],
    tokenHash: tokenDigest(token),
    expiresAt: new Date(Date.now() - 60_000),
  });
  sessionIds.push(session._id);

  const expired = await request('/auth/me', { cookie: `bhoomidrishti_session=${token}` });
  assert.equal(expired.status, 401);
  const invalid = await request('/auth/me', { cookie: 'bhoomidrishti_session=not-a-session' });
  assert.equal(invalid.status, 401);
  const unauthenticated = await request('/projects');
  assert.equal(unauthenticated.status, 401);
});

test('first-admin provisioning creates one account and refuses a duplicate attempt', async () => {
  const script = path.join(__dirname, '..', 'scripts', 'bootstrapAdmin.js');
  const bootstrapPassword = 'one-time-integration-bootstrap-password';
  const env = {
    ...process.env,
    MONGO_URI: mongoUri,
    NODE_ENV: 'test',
    BOOTSTRAP_ADMIN_CONFIRM: 'YES',
    BOOTSTRAP_ADMIN_EMAIL: bootstrapEmail,
    BOOTSTRAP_ADMIN_PASSWORD: bootstrapPassword,
  };
  const first = spawnSync(process.execPath, [script], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);

  const admin = await User.findOne({ email: bootstrapEmail }).select('+password');
  assert.ok(admin);
  assert.equal(admin.role, 'admin');
  assert.notEqual(admin.password, bootstrapPassword);
  const storedHash = admin.password;

  const duplicate = spawnSync(process.execPath, [script], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /administrator already exists/i);

  assert.equal(await User.countDocuments({ role: 'admin', isDemo: { $ne: true } }), 1);
  assert.equal((await User.findOne({ email: bootstrapEmail }).select('+password')).password, storedHash);

  const resetPassword = 'replacement-integration-password';
  const resetScript = path.join(__dirname, '..', 'scripts', 'resetAdminPassword.js');
  const oldSession = await Session.create({
    user: admin._id,
    tokenHash: tokenDigest('pre-reset-integration-session'),
    expiresAt: new Date(Date.now() + 60_000),
  });
  sessionIds.push(oldSession._id);
  const resetEnv = {
    ...process.env,
    MONGO_URI: mongoUri,
    RESET_ADMIN_CONFIRM: 'YES',
    RESET_ADMIN_EMAIL: bootstrapEmail,
    RESET_ADMIN_PASSWORD: resetPassword,
  };
  const reset = spawnSync(process.execPath, [resetScript], { cwd: path.join(__dirname, '..'), env: resetEnv, encoding: 'utf8' });
  assert.equal(reset.status, 0, reset.stderr);
  assert.equal(await Session.exists({ _id: oldSession._id }), null);

  const updatedAdmin = await User.findOne({ email: bootstrapEmail }).select('+password');
  assert.notEqual(updatedAdmin.password, storedHash);
  assert.equal(await require('../services/passwords').verifyPassword(resetPassword, updatedAdmin.password), true);
  assert.equal(await require('../services/passwords').verifyPassword(bootstrapPassword, updatedAdmin.password), false);

  const validLogin = await request('/auth/login', { method: 'POST', body: { email: bootstrapEmail, password: resetPassword } });
  assert.equal(validLogin.status, 200);
  const validLoginBody = await validLogin.json();
  const newSession = await Session.findOne({ user: updatedAdmin._id });
  assert.ok(newSession);
  sessionIds.push(newSession._id);
  assert.equal((await request('/auth/me', { cookie: validLogin.headers.get('set-cookie').split(';', 1)[0] })).status, 200);

  const invalidLogin = await request('/auth/login', { method: 'POST', body: { email: bootstrapEmail, password: bootstrapPassword } });
  assert.equal(invalidLogin.status, 401);
  assert.ok(await Session.exists({ _id: newSession._id }));
  assert.equal(validLoginBody.user.email, bootstrapEmail);
});

test('demo users cannot sign in outside development', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { email: `demo-${email}`, password },
    });
    assert.equal(response.status, 401);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('notification read state is private to the signed-in user and persists', async () => {
  const notification = await Notification.create({
    key: `read-test:${crypto.randomUUID()}`,
    type: 'pending_approval',
    severity: 'low',
    title: 'Notification read integration test',
    message: 'Temporary notification for read-state testing.',
  });
  notificationIds.push(notification._id);

  const anonymous = await request(`/notifications/${notification._id}/read`, { method: 'PATCH' });
  assert.equal(anonymous.status, 401);

  const login = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';', 1)[0];
  const session = await Session.findOne({ user: userIds[0] });
  assert.ok(session);
  sessionIds.push(session._id);

  const markRead = await request(`/notifications/${notification._id}/read`, { method: 'PATCH', cookie });
  assert.equal(markRead.status, 200);
  const marked = await Notification.findById(notification._id).lean();
  assert.ok(marked.readBy.some((userId) => String(userId) === String(userIds[0])));
  assert.equal(await AuditLog.countDocuments({
    entityId: notification._id,
    action: 'read',
    user: userIds[0],
  }), 1);

  const repeated = await request(`/notifications/${notification._id}/read`, { method: 'PATCH', cookie });
  assert.equal(repeated.status, 200);
  assert.equal(await AuditLog.countDocuments({ entityId: notification._id, action: 'read' }), 1);
});

test('mark-all-as-read records each unread notification and is idempotent', async () => {
  const notifications = await Notification.create([
    {
      key: `read-all-test:${crypto.randomUUID()}:1`,
      type: 'pending_approval',
      severity: 'low',
      title: 'First mark-all integration test',
      message: 'Temporary notification for bulk read-state testing.',
    },
    {
      key: `read-all-test:${crypto.randomUUID()}:2`,
      type: 'pending_verification',
      severity: 'medium',
      title: 'Second mark-all integration test',
      message: 'Temporary notification for bulk read-state testing.',
    },
  ]);
  notificationIds.push(...notifications.map((item) => item._id));

  const login = await request('/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';', 1)[0];
  const session = await Session.findOne({ user: userIds[0] });
  assert.ok(session);
  sessionIds.push(session._id);

  const markAll = await request('/notifications/read-all', { method: 'PATCH', cookie });
  assert.equal(markAll.status, 200);
  assert.equal((await markAll.json()).markedCount, 2);

  const persisted = await Notification.find({ _id: { $in: notificationIds } }).lean();
  for (const notification of notifications) {
    const stored = persisted.find((item) => String(item._id) === String(notification._id));
    assert.ok(stored.readBy.some((userId) => String(userId) === String(userIds[0])));
  }
  assert.equal(await AuditLog.countDocuments({
    entityId: { $in: notifications.map((item) => item._id) },
    action: 'read',
    user: userIds[0],
  }), 2);

  const repeated = await request('/notifications/read-all', { method: 'PATCH', cookie });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).markedCount, 0);
});

test('login reports database unavailability as a service error', async () => {
  await mongoose.disconnect();
  try {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).message, /database is unavailable/i);
  } finally {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }
});
