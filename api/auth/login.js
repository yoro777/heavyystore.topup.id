'use strict';
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { verifyPassword, signToken, setAuthCookie } = require('../_lib/auth');
const { logAudit } = require('../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    const body = getBody(req);
    const data = validateOrThrow(body, {
      identifier: { type: 'string', required: true, max: 120 },
      password: { type: 'string', required: true, min: 1, max: 128 },
    });

    const { rows } = await query(
      `SELECT id, username, email, phone, password_hash, referral_code, status
         FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1)`,
      [data.identifier]
    );
    const user = rows[0];
    // Constant-ish response to avoid user enumeration
    if (!user) throw httpError(401, 'Email/username atau password salah');
    if (user.status !== 'active') throw httpError(403, 'Akun Anda dinonaktifkan. Hubungi admin.');

    const valid = await verifyPassword(data.password, user.password_hash);
    if (!valid) throw httpError(401, 'Email/username atau password salah');

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ sub: user.id, role: 'user', username: user.username });
    setAuthCookie(res, 'user', token);

    await logAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    delete user.password_hash;
    return ok(res, { user });
  },
  { methods: ['POST'], rate: { window: 60, max: 15 } }
);
