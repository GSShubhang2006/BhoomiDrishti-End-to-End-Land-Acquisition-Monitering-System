const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');

const SESSION_COOKIE = 'bhoomidrishti_session';
const sessionDurationMs = 12 * 60 * 60 * 1000;

function getCookieValue(header, name) {
  const prefix = `${name}=`;
  const cookie = (header || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || null,
  };
}

const requireAuth = async (req, res, next) => {
  const token = getCookieValue(req.headers.cookie, SESSION_COOKIE);
  if (!token) return res.status(401).json({ message: 'Sign in is required to access this resource' });
  try {
    const session = await Session.findOne({ tokenHash: tokenDigest(token), expiresAt: { $gt: new Date() } }).select('user');
    if (!session) return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
    const user = await User.findById(session.user).select('name email role department isDemo');
    if (!user) return res.status(401).json({ message: 'Your account is unavailable. Sign in again.' });
    req.user = user;
    req.session = session;
    return next();
  } catch (error) {
    console.error('Failed to validate session:', error.message);
    return res.status(500).json({ message: 'Could not validate the current session' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Sign in is required to access this resource' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Your role is not permitted to perform this action' });
  return next();
};

const createSession = async (user) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await Session.create({ tokenHash: tokenDigest(token), user: user._id, expiresAt });
  return { token, expiresAt };
};

const clearSession = async (req, res) => {
  const token = getCookieValue(req.headers.cookie, SESSION_COOKIE);
  if (token) await Session.deleteOne({ tokenHash: tokenDigest(token) });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure}`);
};

const setSessionCookie = (res, token, expiresAt) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`);
};

module.exports = {
  SESSION_COOKIE,
  clearSession,
  createSession,
  getCookieValue,
  requireAuth,
  requireRole,
  serializeUser,
  setSessionCookie,
  tokenDigest,
};
