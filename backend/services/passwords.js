const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function hashPassword(password) {
  return hashPasswordSync(password);
}

async function verifyPassword(password, encoded) {
  const [scheme, salt, storedHex, ...extra] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !storedHex || extra.length) return false;
  const stored = Buffer.from(storedHex, 'hex');
  if (stored.length !== KEY_LENGTH) return false;
  const computed = await scrypt(password, salt, stored.length);
  return crypto.timingSafeEqual(stored, computed);
}

module.exports = { hashPassword, hashPasswordSync, verifyPassword };
