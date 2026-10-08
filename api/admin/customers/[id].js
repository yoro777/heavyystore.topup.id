'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { hashPassword } = require('../../_lib/auth');
const { logAudit } = require('../../_lib/audit');
const { getPublicOrder } = require('../../_lib/serialize');

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT id, username, email, phone, referral_code, referred_by, status, created_at, last_login_at
           FROM users WHERE id = $1`,
        [id]
      );
      if (!rows[0]) throw httpError(404, 'Customer tidak ditemukan');
      const { rows: stats } = await query(
        `SELECT COUNT(*)::int AS total_transactions,
                COALESCE(SUM(grand_total) FILTER (WHERE status='SUCCESS'),0)::numeric AS total_spent
           FROM orders WHERE user_id = $1`,
        [id]
      );
      const { rows: orderRows } = await query(
        'SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
        [id]
      );
      const orders = [];
      for (const r of orderRows) orders.push(await getPublicOrder(r.id));
      return ok(res, { customer: rows[0], stats: stats[0], orders });
    }

    // PUT: suspend / activate / reset_password
    const body = getBody(req);
    const action = String(body.action || '');
    if (action === 'suspend' || action === 'activate') {
      const status = action === 'suspend' ? 'suspended' : 'active';
      const { rows } = await query('UPDATE users SET status = $2 WHERE id = $1 RETURNING id, username, status', [id, status]);
      if (!rows[0]) throw httpError(404, 'Customer tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: `customer.${action}`, entity: 'user', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { customer: rows[0] });
    }
    if (action === 'reset_password') {
      const password = String(body.password || '');
      if (password.length < 8) throw httpError(422, 'Password minimal 8 karakter');
      const hash = await hashPassword(password);
      const { rows } = await query('UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id, username', [id, hash]);
      if (!rows[0]) throw httpError(404, 'Customer tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'customer.reset_password', entity: 'user', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Password customer berhasil direset' });
    }

    throw httpError(400, 'Aksi tidak dikenal');
  },
  { methods: ['GET', 'PUT'], auth: 'admin' }
);
