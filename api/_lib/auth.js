'use strict';
/**
 * Authentication & authorization.
 * - bcrypt password hashing
 * - JWT sessions delivered via HttpOnly, SameSite=Lax cookies
 * - role separation: customer ("user") vs "admin"
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const { httpError } = require('./response');

const USER_COOKIE = 'hvy_token';
const ADMIN_COOKIE = 'hvy_admin';
const BCRYPT_ROUNDS = 12;

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('JWT_SECRET is not configured (min 16 chars)');
    err.statusCode = 500;
    throw err;
  }
  return s;
}

const signToken = (payload, expiresIn = '7d') => jwt.sign(payload, getSecret(), { expiresIn });
const verifyToken = (token) => jwt.verify(token, getSecret());

const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS);
const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) {
        try { out[k] = decodeURIComponent(v); } catch (_) { out[k] = v; }
      }
    }
  });
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.secure || process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', cookieStr);
  else if (Array.isArray(existing)) res.setHeader('Set-Cookie', [...existing, cookieStr]);
  else res.setHeader('Set-Cookie', [existing, cookieStr]);
}

function setAuthCookie(res, role, token) {
  const name = role === 'admin' ? ADMIN_COOKIE : USER_COOKIE;
  appendSetCookie(res, serializeCookie(name, token, { maxAge: role === 'admin' ? 60 * 60 * 12 : 60 * 60 * 24 * 7 }));
}

function clearAuthCookie(res, role) {
  const name = role === 'admin' ? ADMIN_COOKIE : USER_COOKIE;
  appendSetCookie(res, serializeCookie(name, '', { maxAge: 0 }));
}

function getBearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/** Resolve the authenticated actor(s) from cookies/bearer. */
async function resolveAuth(req, mode = 'optional') {
  const cookies = parseCookies(req);
  const candidates = [getBearer(req), cookies[USER_COOKIE], cookies[ADMIN_COOKIE]].filter(Boolean);
  const result = { user: null, admin: null };

  for (const token of candidates) {
    let payload;
    try { payload = verifyToken(token); } catch (_) { continue; }
    if (payload.role === 'admin' && !result.admin) {
      const { rows } = await query(
        'SELECT id, username, email, role, status FROM admins WHERE id = $1',
        [payload.sub]
      );
      if (rows[0] && rows[0].status === 'active') result.admin = rows[0];
    } else if (payload.role === 'user' && !result.user) {
      const { rows } = await query(
        'SELECT id, username, email, phone, referral_code, status FROM users WHERE id = $1',
        [payload.sub]
      );
      if (rows[0] && rows[0].status === 'active') result.user = rows[0];
    }
  }

  if (mode === 'user' && !result.user) throw httpError(401, 'Silakan login terlebih dahulu');
  if (mode === 'admin' && !result.admin) throw httpError(401, 'Akses admin diperlukan');
  return result;
}

module.exports = {
  USER_COOKIE,
  ADMIN_COOKIE,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  serializeCookie,
  setAuthCookie,
  clearAuthCookie,
  resolveAuth,
  getBearer,
};
