'use strict';
/**
 * DB-backed fixed-window rate limiter (survives serverless cold starts).
 * Falls back to allow-all if the DB is unreachable so it never hard-blocks traffic
 * on infrastructure hiccups — security-sensitive routes still validate auth.
 *
 * NOTE: this module intentionally does NOT require ./response to avoid a circular
 * dependency (response.js -> ratelimit.js -> response.js) that would leave
 * getClientIp undefined at call time. The IP helper is inlined below.
 */
const { query } = require('./db');

function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (
    (req.headers && req.headers['x-real-ip'] && String(req.headers['x-real-ip'])) ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

function bucketKey(req, customKey) {
  if (customKey) return customKey;
  // Key by route + method + IP so each endpoint has its own independent window.
  // (A shared IP-only bucket would let one route's limit bleed into another's.)
  const path = String((req.url || req.path || '/')).split('?')[0] || '/';
  const method = String(req.method || 'GET').toUpperCase();
  return `${method} ${path} | ip:${clientIp(req)}`;
}

async function checkRateLimit(req, opts = {}) {
  const window = Number(opts.window || process.env.RATE_LIMIT_WINDOW_SECONDS || 60);
  const max = Number(opts.max || process.env.RATE_LIMIT_MAX || 120);
  const bucket = bucketKey(req, opts.key);

  try {
    const windowMs = window * 1000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const { rows } = await query(
      `INSERT INTO rate_limits (bucket, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [bucket, windowStart]
    );
    // opportunistic cleanup (~5% of calls)
    if (Math.random() < 0.05) {
      query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'`).catch(() => {});
    }
    return rows[0].count <= max;
  } catch (err) {
    console.warn('[ratelimit] bypassed:', err.message);
    return true;
  }
}

module.exports = { checkRateLimit };
