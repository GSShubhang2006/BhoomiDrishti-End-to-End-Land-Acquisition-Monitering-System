const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { hashPassword, verifyPassword } = require('../services/passwords');
const {
  clearSession,
  createSession,
  requireAuth,
  serializeUser,
  setSessionCookie,
} = require('../middleware/authentication');
const Session = require('../models/Session');
const invalidCredentialsMessage = 'Email or password is incorrect. Verify both fields and try again.';
const signInUnavailableMessage = 'Sign-in service is temporarily unavailable. Check API/database health and try again.';

const login = async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password || email.length > 254 || password.length > 1024) {
    return res.status(400).json({ message: 'A valid email and password are required' });
  }
  try {
    const user = await User.findOne({ email }).select('+password name email role department isDemo');
    if (user?.isDemo && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({ message: invalidCredentialsMessage });
    }
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ message: invalidCredentialsMessage });
    }
    const { token, expiresAt } = await createSession(user);
    setSessionCookie(res, token, expiresAt);
    return res.status(200).json({ user: serializeUser(user), expiresAt });
  } catch (error) {
    console.error('Failed to sign in:', error.name || 'UnknownError');
    return res.status(500).json({ message: signInUnavailableMessage });
  }
};

const demoLogin = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ message: 'Route not found' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ message: 'A valid email and password are required' });
  try {
    const user = await User.findOne({ email, isDemo: true }).select('+password name email role department');
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ message: invalidCredentialsMessage });
    }
    const { token, expiresAt } = await createSession(user);
    setSessionCookie(res, token, expiresAt);
    return res.status(200).json({ user: serializeUser(user), expiresAt });
  } catch (error) {
    console.error('Failed to sign in to the demo environment:', error.name || 'UnknownError');
    return res.status(500).json({ message: signInUnavailableMessage });
  }
};

const currentUser = [
  requireAuth,
  (req, res) => res.status(200).json({ user: serializeUser(req.user) }),
];

const logout = [
  requireAuth,
  async (req, res) => {
    try {
      await clearSession(req, res);
      return res.status(200).json({ message: 'Signed out' });
    } catch (error) {
      console.error('Failed to sign out:', error.message);
      return res.status(500).json({ message: 'Could not sign out at this time' });
    }
  },
];

const updateCurrentUser = [
  requireAuth,
  async (req, res) => {
    const body = req.body || {};
    const supported = new Set(['name', 'department', 'currentPassword', 'newPassword']);
    const unsupported = Object.keys(body).filter((key) => !supported.has(key));
    if (unsupported.length) return res.status(400).json({ message: `Unsupported profile fields: ${unsupported.join(', ')}` });
    const fieldsChanged = Object.keys(body).filter((key) => key === 'name' || key === 'department');
    if (!fieldsChanged.length && !body.newPassword) return res.status(400).json({ message: 'Provide profile details or a new password' });
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) {
      return res.status(400).json({ message: 'Name must contain 1–100 characters' });
    }
    if (body.department !== undefined && (typeof body.department !== 'string' || body.department.trim().length > 150)) {
      return res.status(400).json({ message: 'Department must be 150 characters or fewer' });
    }
    if (body.newPassword && (typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 1024)) {
      return res.status(400).json({ message: 'New password must contain at least 12 characters' });
    }
    try {
      const user = await User.findById(req.user._id).select('+password name email role department isDemo');
      if (!user) return res.status(404).json({ message: 'User account was not found' });
      if (body.newPassword) {
        if (typeof body.currentPassword !== 'string' || !(await verifyPassword(body.currentPassword, user.password))) {
          return res.status(401).json({ message: 'Current password is incorrect' });
        }
        user.password = await hashPassword(body.newPassword);
        await Session.deleteMany({ user: user._id, _id: { $ne: req.session._id } });
      }
      if (body.name !== undefined) user.name = body.name.trim();
      if (body.department !== undefined) user.department = body.department.trim();
      await user.save();
      await AuditLog.create({
        user: user._id,
        action: body.newPassword ? 'credentials_updated' : 'profile_updated',
        entityType: 'User',
        entityId: user._id,
        description: `Updated profile fields: ${[...fieldsChanged, ...(body.newPassword ? ['password'] : [])].join(', ')}.`,
        isDemo: user.isDemo,
      });
      return res.status(200).json({ message: 'Profile updated', user: serializeUser(user) });
    } catch (error) {
      console.error('Failed to update profile:', error.message);
      return res.status(500).json({ message: 'Could not update the profile and record its audit event' });
    }
  },
];

module.exports = { login, demoLogin, currentUser, logout, updateCurrentUser };
