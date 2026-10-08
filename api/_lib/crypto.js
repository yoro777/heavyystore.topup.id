'use strict';
/**
 * Symmetric encryption for secrets at rest (supplier keys, etc.).
 * AES-256-GCM with a key derived from SECRETS_KEY (or JWT_SECRET as fallback).
 * Stored format: "enc:v1:<base64(iv|tag|ciphertext)>"
 */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function getKey() {
  const secret = process.env.SECRETS_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('SECRETS_KEY/JWT_SECRET not configured');
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  if (payload === null || payload === undefined || payload === '') return null;
  const str = String(payload);
  if (!str.startsWith(PREFIX)) return str; // plaintext (legacy / env-provided)
  const raw = Buffer.from(str.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Mask a secret for display: never return plaintext to the client. */
function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 6) return '••••••';
  return s.slice(0, 3) + '••••••' + s.slice(-3);
}

module.exports = { encrypt, decrypt, maskSecret };
