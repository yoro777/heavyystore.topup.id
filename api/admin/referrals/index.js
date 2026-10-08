'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { validateOrThrow } = require('../../_lib/validate');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const { rows } = await query(`
        SELECT r.*, u.username AS user_username,
               (SELECT COUNT(*)::int FROM referral_usages ru WHERE ru.referral_id = r.id) AS actual_usages
          FROM referrals r
          LEFT JOIN users u ON u.id = r.user_id
         ORDER BY r.created_at DESC`);
      return ok(res, { referrals: rows });
    }

    const data = validateOrThrow(getBody(req), {
      code: { type: 'string', required: true, min: 3, max: 40 },
      description: { type: 'string', max: 200, nullable: true },
      discount_type: { type: 'enum', values: ['percent', 'fixed'], default: 'percent' },
      discount_value: { type: 'number', required: true, min: 0 },
      min_transaction: { type: 'number', default: 0, min: 0 },
      max_discount: { type: 'number', default: 0, min: 0 },
      start_date: { type: 'string', nullable: true },
      end_date: { type: 'string', nullable: true },
      usage_limit: { type: 'integer', default: 0, min: 0 },
      user_id: { type: 'integer', nullable: true },
      is_active: { type: 'boolean', default: true },
    });

    const code = data.code.toUpperCase();
    const dup = await query('SELECT id FROM referrals WHERE upper(code) = $1', [code]);
    if (dup.rows.length) throw httpError(409, 'Kode referral sudah ada');

    const { rows } = await query(
      `INSERT INTO referrals (code, description, discount_type, discount_value, min_transaction, max_discount, start_date, end_date, usage_limit, user_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [code, data.description, data.discount_type, data.discount_value, data.min_transaction, data.max_discount, data.start_date || null, data.end_date || null, data.usage_limit, data.user_id || null, data.is_active]
    );
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'referral.create', entity: 'referral', entityId: rows[0].id, details: { code }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { referral: rows[0] }, 201);
  },
  { methods: ['GET', 'POST'], auth: 'admin' }
);
