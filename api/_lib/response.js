'use strict';
/**
 * HTTP helpers + a small handler wrapper used by every API route.
 * Handles CORS (same-origin by default), method guards, rate limiting and errors.
 */
const { checkRateLimit } = require('./ratelimit');

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || process.env.APP_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = allowedOrigins();
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-CSRF-Token'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, body) {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

const ok = (res, data = {}, status = 200) => sendJson(res, status, { success: true, ...data });
const fail = (res, status, message, extra = {}) =>
  sendJson(res, status, { success: false, error: message, ...extra });

function httpError(status, message, expose = true) {
  const err = new Error(message);
  err.statusCode = status;
  err.expose = expose;
  return err;
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (
    (req.headers['x-real-ip'] && String(req.headers['x-real-ip'])) ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

/**
 * Wrap a route handler.
 * @param {(req,res,ctx)=>Promise<void>} fn
 * @param {object} opts { methods, auth: 'none'|'user'|'admin'|'optional', rate: {window,max,key} }
 */
function handler(fn, opts = {}) {
  const methods = opts.methods || ['GET'];
  return async function wrapped(req, res) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return fail(res, 405, 'Method not allowed');
    }
    try {
      if (opts.rate !== false) {
        const rate = opts.rate || {};
        const allowed = await checkRateLimit(req, rate);
        if (!allowed) return fail(res, 429, 'Terlalu banyak permintaan. Silakan coba lagi nanti.');
      }
      const ctx = { ip: getClientIp(req), userAgent: req.headers['user-agent'] || '' };
      if (opts.auth && opts.auth !== 'none') {
        const { resolveAuth } = require('./auth');
        ctx.auth = await resolveAuth(req, opts.auth);
        ctx.user = ctx.auth.user || null;
        ctx.admin = ctx.auth.admin || null;
      }
      await fn(req, res, ctx);
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) console.error('[api:error]', err && err.stack ? err.stack : err);
      if (!res.writableEnded) {
        fail(res, status, err.expose ? err.message : 'Terjadi kesalahan pada server');
      }
    }
  };
}

/** Safely parse a JSON body (Vercel auto-parses, but be defensive). */
function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return {};
}

module.exports = {
  handler,
  ok,
  fail,
  sendJson,
  httpError,
  getClientIp,
  getBody,
  setCors,
};
