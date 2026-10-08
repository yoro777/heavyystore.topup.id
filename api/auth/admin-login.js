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
      `SELECT id, username, email, password_hash, role, status
         FROM admins WHERE lower(email) = lower($1) OR lower(username) = lower($1)`,
      [data.identifier]
    );
    const admin = rows[0];
    if (!admin) throw httpError(401, 'Kredensial admin salah');
    if (admin.status !== 'active') throw httpError(403, 'Akun admin dinonaktifkan');

    const valid = await verifyPassword(data.password, admin.password_hash);
    if (!valid) throw httpError(401, 'Kredensial admin salah');

    await query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);

    const token = signToken({ sub: admin.id, role: 'admin', username: admin.username }, '12h');
    setAuthCookie(res, 'admin', token);

    await logAudit({
      actorType: 'admin',
      actorId: admin.id,
      action: 'admin.login',
      entity: 'admin',
      entityId: admin.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    delete admin.password_hash;
    return ok(res, { admin });
  },
  { methods: ['POST'], rate: { window: 300, max: 10 } }
);
