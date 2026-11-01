require('dotenv').config();
const { connectDB } = require('../config/db');
const User = require('../models/User');
const { hashPassword } = require('../services/passwords');

async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== 'YES') {
    throw new Error('Admin bootstrap blocked. Set BOOTSTRAP_ADMIN_CONFIRM=YES for this one-time command.');
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD to a private password of 12–1024 characters.');
  }

  await connectDB();
  if (await User.exists({ role: 'admin', isDemo: { $ne: true } })) {
    throw new Error('An administrator already exists. Admin bootstrap will not replace or reset accounts.');
  }
  if (await User.exists({ email })) {
    throw new Error('An account already uses this email. Admin bootstrap will not replace or reset accounts.');
  }
  await User.create({
    name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'System Administrator',
    email,
    password: await hashPassword(password),
    role: 'admin',
  });
  console.log('Administrator account created. Sign in using the configured email and password.');
}

bootstrapAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  });
