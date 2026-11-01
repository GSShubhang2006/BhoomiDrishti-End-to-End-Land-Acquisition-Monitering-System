const assert = require('node:assert/strict');
const { test } = require('node:test');
const User = require('../models/User');
const { getCookieValue, requireAuth, requireRole, tokenDigest } = require('../middleware/authentication');
const Session = require('../models/Session');
const { demoLogin, login, logout } = require('../controllers/authController');
const { hashPassword, verifyPassword } = require('../services/passwords');

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, value) {
    this.headers[name] = value;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('password hashes verify without storing the original password', async () => {
  const password = 'A long private test password!';
  const encoded = await hashPassword(password);
  assert.notEqual(encoded, password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword('incorrect password', encoded), false);
  assert.equal(await verifyPassword(password, 'not-a-hash'), false);
});

test('session cookie parsing safely handles missing and malformed cookie headers', () => {
  assert.equal(getCookieValue('other=value; bhoomidrishti_session=abc%2F123', 'bhoomidrishti_session'), 'abc/123');
  assert.equal(getCookieValue('bhoomidrishti_session=%E0%A4%A', 'bhoomidrishti_session'), null);
  assert.equal(getCookieValue(undefined, 'bhoomidrishti_session'), null);
  assert.equal(tokenDigest('secret-token').length, 64);
});

test('role checks deny unauthorized roles and allow configured roles', () => {
  const response = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  requireRole('admin')({ user: { role: 'field_officer' } }, response, () => { continued = true; });
  assert.equal(response.code, 403);
  assert.equal(continued, false);
  requireRole('admin')({ user: { role: 'admin' } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('requests without a session cookie are rejected before route handlers run', async () => {
  const response = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  await requireAuth({ headers: {} }, response, () => { continued = true; });
  assert.equal(response.code, 401);
  assert.equal(response.body.message, 'Sign in is required to access this resource');
  assert.equal(continued, false);
});

test('expired server-side sessions are rejected', async () => {
  const originalFindOne = Session.findOne;
  Session.findOne = () => ({ select: async () => null });
  const response = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let continued = false;
  try {
    await requireAuth(
      { headers: { cookie: 'bhoomidrishti_session=opaque-token' } },
      response,
      () => { continued = true; },
    );
  } finally {
    Session.findOne = originalFindOne;
  }
  assert.equal(response.code, 401);
  assert.match(response.body.message, /session has expired/i);
  assert.equal(continued, false);
});

test('logout expires the cookie before sending its response', async () => {
  const originalDeleteOne = Session.deleteOne;
  let cookieCleared = false;
  Session.deleteOne = async (filter) => {
    assert.equal(filter.tokenHash, tokenDigest('opaque-token'));
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { deletedCount: 1 };
  };
  const response = {
    headersSent: false,
    statusCode: 200,
    setHeader(name, value) {
      assert.equal(name, 'Set-Cookie');
      assert.match(value, /Max-Age=0/);
      cookieCleared = true;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      assert.equal(cookieCleared, true);
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
  try {
    await logout[1](
      { headers: { cookie: 'bhoomidrishti_session=opaque-token' } },
      response,
    );
  } finally {
    Session.deleteOne = originalDeleteOne;
  }
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, 'Signed out');
});

test('invalid credentials receive the generic unauthorized response', async () => {
  const originalFindOne = User.findOne;
  const originalNodeEnv = process.env.NODE_ENV;
  const passwordHash = await hashPassword('correct-password-for-test');
  User.findOne = () => ({
    select: async () => ({
      _id: '672000000000000000000001',
      email: 'admin@example.test',
      name: 'Test Admin',
      role: 'admin',
      isDemo: false,
      password: passwordHash,
    }),
  });
  process.env.NODE_ENV = 'test';
  const response = createResponse();
  try {
    await login({ body: { email: 'admin@example.test', password: 'incorrect-password' } }, response);
  } finally {
    User.findOne = originalFindOne;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, 'Email or password is incorrect. Verify both fields and try again.');
});

test('login reports API failures without exposing the underlying error', async () => {
  const originalFindOne = User.findOne;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  let loggedDetails;
  User.findOne = () => {
    throw new Error('sensitive database connection detail');
  };
  console.error = (...details) => { loggedDetails = details; };
  process.env.NODE_ENV = 'test';
  const response = createResponse();
  try {
    await login({ body: { email: 'admin@example.test', password: 'test-password' } }, response);
  } finally {
    User.findOne = originalFindOne;
    console.error = originalConsoleError;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
  assert.equal(response.statusCode, 500);
  assert.match(response.body.message, /check api\/database health/i);
  assert.deepEqual(loggedDetails, ['Failed to sign in:', 'Error']);
});

test('demo accounts and demo login are disabled outside development', async () => {
  const originalFindOne = User.findOne;
  const originalNodeEnv = process.env.NODE_ENV;
  User.findOne = () => ({
    select: async () => ({
      _id: '672000000000000000000001',
      email: 'demo@example.test',
      name: 'Synthetic Demo Admin',
      role: 'admin',
      isDemo: true,
      password: 'not-used-for-this-guard-test',
    }),
  });
  process.env.NODE_ENV = 'test';
  try {
    const loginResponse = createResponse();
    await login({ body: { email: 'demo@example.test', password: 'test-password' } }, loginResponse);
    assert.equal(loginResponse.statusCode, 401);
    assert.equal(loginResponse.body.message, 'Email or password is incorrect. Verify both fields and try again.');

    const demoLoginResponse = createResponse();
    await demoLogin({ body: { email: 'demo@example.test', password: 'test-password' } }, demoLoginResponse);
    assert.equal(demoLoginResponse.statusCode, 404);
    assert.equal(demoLoginResponse.body.message, 'Route not found');
  } finally {
    User.findOne = originalFindOne;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
