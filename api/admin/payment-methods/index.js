'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { validateOrThrow } = require('../../_lib/validate');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM payment_methods ORDER BY sort_order, name');
      return ok(res, { methods: rows });
    }

    const data = validateOrThrow(getBody(req), {
      code: { type: 'string', required: true, min: 2, max: 40 },
      name: { type: 'string', required: true, min: 2, max: 80 },
      type: { type: 'enum', values: ['ewallet', 'bank_transfer', 'qris', 'retail', 'other'], required: true },
      provider: { type: 'string', default: 'midtrans', max: 40 },
      logo_url: { type: 'string', max: 300, nullable: true },
      fee_flat: { type: 'number', default: 0, min: 0 },
      fee_percent: { type: 'number', default: 0, min: 0 },
      min_amount: { type: 'number', default: 0, min: 0 },
      max_amount: { type: 'number', default: 0, min: 0 },
      instructions: { type: 'string', max: 500, nullable: true },
      is_active: { type: 'boolean', default: true },
      sort_order: { type: 'integer', default: 0 },
    });

    const dup = await query('SELECT id FROM payment_methods WHERE code = $1', [data.code]);
    if (dup.rows.length) throw httpError(409, 'Kode metode pembayaran sudah ada');

    const { rows } = await query(
      `INSERT INTO payment_methods (code, name, type, provider, logo_url, fee_flat, fee_percent, min_amount, max_amount, instructions, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.code, data.name, data.type, data.provider, data.logo_url, data.fee_flat, data.fee_percent, data.min_amount, data.max_amount, data.instructions, data.is_active, data.sort_order]
    );
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'payment_method.create', entity: 'payment_method', entityId: rows[0].id, details: { code: data.code }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { method: rows[0] }, 201);
  },
  { methods: ['GET', 'POST'], auth: 'admin' }
);
