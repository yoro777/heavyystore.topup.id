'use strict';
/**
 * One-time bootstrap for the FIRST admin account.
 * Requires ADMIN_SECRET and only works while no admin exists.
 * After the first admin is created this endpoint is permanently disabled.
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { hashPassword } = require('../_lib/auth');
const { logAudit } = require('../_lib/audit');
const { safeEqual } = require('../_lib/utils');

module.exports = handler(
  async (req, res, ctx) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) throw httpError(503, 'ADMIN_SECRET belum dikonfigurasi');

    const { rows: existing } = await query('SELECT COUNT(*)::int AS c FROM admins');
    if (existing[0].c > 0) throw httpError(403, 'Bootstrap admin sudah tidak tersedia');

    const body = getBody(req);
    const data = validateOrThrow(body, {
      admin_secret: { type: 'string', required: true },
      username: { type: 'string', required: true, min: 3, max: 30 },
      email: { type: 'email', required: true, max: 120 },
      password: { type: 'string', required: true, min: 10, max: 128 },
    });

    if (!safeEqual(data.admin_secret, secret)) throw httpError(403, 'ADMIN_SECRET salah');

    const hash = await hashPassword(data.password);
    const { rows } = await query(
      `INSERT INTO admins (username, email, password_hash, role)
       VALUES ($1,$2,$3,'superadmin')
       RETURNING id, username, email, role`,
      [data.username, data.email, hash]
    );

    await logAudit({
      actorType: 'system',
      action: 'admin.bootstrap',
      entity: 'admin',
      entityId: rows[0].id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return ok(res, { admin: rows[0], message: 'Admin pertama berhasil dibuat' }, 201);
  },
  { methods: ['POST'], rate: { window: 300, max: 5 } }
);
