'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

const FIELDS = ['code', 'name', 'type', 'provider', 'logo_url', 'fee_flat', 'fee_percent', 'min_amount', 'max_amount', 'instructions', 'is_active', 'sort_order'];

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'DELETE') {
      const { rows } = await query('DELETE FROM payment_methods WHERE id = $1 RETURNING id', [id]);
      if (!rows[0]) throw httpError(404, 'Metode tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'payment_method.delete', entity: 'payment_method', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Metode pembayaran dihapus' });
    }

    const body = getBody(req);
    const sets = [];
    const params = [];
    let i = 1;
    for (const f of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        sets.push(`${f} = $${i++}`);
        params.push(body[f]);
      }
    }
    if (!sets.length) throw httpError(400, 'Tidak ada perubahan');
    params.push(id);
    const { rows } = await query(`UPDATE payment_methods SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows[0]) throw httpError(404, 'Metode tidak ditemukan');
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'payment_method.update', entity: 'payment_method', entityId: id, details: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { method: rows[0] });
  },
  { methods: ['PUT', 'PATCH', 'DELETE'], auth: 'admin' }
);
