require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword } = require('../services/passwords');

async function resetAdminPassword() {
  const email = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD;
  if (process.env.RESET_ADMIN_CONFIRM !== 'YES') {
    throw new Error('Admin password reset blocked. Set RESET_ADMIN_CONFIRM=YES for this one-time command.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set RESET_ADMIN_EMAIL to the existing administrator email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('Set RESET_ADMIN_PASSWORD to a private password of 12–1024 characters.');
  }

  await connectDB();
  const user = await User.findOne({ email, role: 'admin', isDemo: { $ne: true } }).select('+password');
  if (!user) {
    throw new Error('No non-demo administrator exists with the configured email. No account was changed.');
  }

  user.password = await hashPassword(password);
  await user.save();
  await Session.deleteMany({ user: user._id });
  console.log('Administrator password updated and existing sessions revoked.');
}

resetAdminPassword()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  });
