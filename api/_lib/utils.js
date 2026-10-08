'use strict';
const crypto = require('crypto');

/** Public order id, e.g. HVY-20261008-9F3A1C (date in Asia/Jakarta). */
function generateOrderId() {
  const now = new Date();
  const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const y = jakarta.getFullYear();
  const m = String(jakarta.getMonth() + 1).padStart(2, '0');
  const d = String(jakarta.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HVY-${y}${m}${d}-${rand}`;
}

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Generate a shareable referral code from a username. */
function generateReferralCode(username = '') {
  const base = String(username).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'USER';
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${base}${rand}`;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function formatIdr(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

/** Compute payment fee (server-side). */
function computeFee(method, amount) {
  if (!method) return 0;
  const flat = Number(method.fee_flat || 0);
  const percent = Number(method.fee_percent || 0);
  return Math.round(flat + (amount * percent) / 100);
}

/** Constant-time string compare. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  generateOrderId,
  randomToken,
  generateReferralCode,
  slugify,
  formatIdr,
  computeFee,
  safeEqual,
};
