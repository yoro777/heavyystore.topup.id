'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res, ctx) => {
    if (!ctx.user) return ok(res, { user: null });
    const { rows } = await query(
      `SELECT
         COUNT(*)::int AS total_transactions,
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN grand_total ELSE 0 END), 0)::numeric AS total_spent,
         COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END), 0)::int AS total_success
       FROM orders WHERE user_id = $1`,
      [ctx.user.id]
    );
    return ok(res, { user: ctx.user, stats: rows[0] });
  },
  { methods: ['GET'], auth: 'optional' }
);
