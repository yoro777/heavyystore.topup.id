'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

const FIELDS = ['game_id', 'supplier_id', 'name', 'denomination', 'supplier_code', 'supplier_cost', 'selling_price', 'margin_type', 'margin_value', 'min_price', 'max_discount', 'promo_price', 'is_promo', 'is_active', 'is_maintenance', 'stock', 'sort_order'];

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'DELETE') {
      const { rows } = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
      if (!rows[0]) throw httpError(404, 'Produk tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'product.delete', entity: 'product', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Produk dihapus' });
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
    const { rows } = await query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows[0]) throw httpError(404, 'Produk tidak ditemukan');

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'product.update', entity: 'product', entityId: id, details: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { product: rows[0] });
  },
  { methods: ['PUT', 'PATCH', 'DELETE'], auth: 'admin' }
);
