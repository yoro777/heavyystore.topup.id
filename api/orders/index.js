'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getPublicOrder } = require('../_lib/serialize');

module.exports = handler(
  async (req, res, ctx) => {
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { rows } = await query(
      'SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [ctx.user.id, limit, offset]
    );
    const orders = [];
    for (const r of rows) orders.push(await getPublicOrder(r.id));
    return ok(res, { orders });
  },
  { methods: ['GET'], auth: 'user' }
);
