'use strict';
const { handler, ok, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getPublicOrder } = require('../_lib/serialize');

module.exports = handler(
  async (req, res, ctx) => {
    const orderId = String(req.query.id || '');
    const { rows } = await query('SELECT id, user_id FROM orders WHERE order_id = $1', [orderId]);
    const row = rows[0];
    if (!row) throw httpError(404, 'Pesanan tidak ditemukan');

    const isOwner = ctx.user && ctx.user.id === row.user_id;
    const isAdmin = Boolean(ctx.admin);
    if (!isOwner && !isAdmin) throw httpError(403, 'Anda tidak berhak melihat pesanan ini');

    return ok(res, { order: await getPublicOrder(row.id) });
  },
  { methods: ['GET'], auth: 'optional' }
);
