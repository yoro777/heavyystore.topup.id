'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

const FIELDS = ['code', 'description', 'discount_type', 'discount_value', 'min_transaction', 'max_discount', 'start_date', 'end_date', 'usage_limit', 'user_id', 'is_active'];

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'DELETE') {
      const { rows } = await query('DELETE FROM referrals WHERE id = $1 RETURNING id', [id]);
      if (!rows[0]) throw httpError(404, 'Referral tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'referral.delete', entity: 'referral', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Referral dihapus' });
    }

    const body = getBody(req);
    const sets = [];
    const params = [];
    let i = 1;
    for (const f of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        let v = body[f];
        if (f === 'code') v = String(v).toUpperCase();
        if ((f === 'start_date' || f === 'end_date') && !v) v = null;
        sets.push(`${f} = $${i++}`);
        params.push(v);
      }
    }
    if (!sets.length) throw httpError(400, 'Tidak ada perubahan');
    params.push(id);
    const { rows } = await query(`UPDATE referrals SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows[0]) throw httpError(404, 'Referral tidak ditemukan');
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'referral.update', entity: 'referral', entityId: id, details: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { referral: rows[0] });
  },
  { methods: ['PUT', 'PATCH', 'DELETE'], auth: 'admin' }
);
