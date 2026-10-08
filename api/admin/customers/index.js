'use strict';
const { handler, ok } = require('../../_lib/response');
const { query } = require('../../_lib/db');

module.exports = handler(
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 25), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const where = [];
    const params = [];
    let i = 1;
    if (req.query.search) {
      where.push(`(u.username ILIKE $${i} OR u.email ILIKE $${i} OR u.phone ILIKE $${i} OR u.referral_code ILIKE $${i})`);
      params.push(`%${req.query.search}%`);
      i++;
    }
    if (req.query.status && ['active', 'suspended'].includes(req.query.status)) {
      where.push(`u.status = $${i++}`);
      params.push(req.query.status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT u.id, u.username, u.email, u.phone, u.referral_code, u.referred_by, u.status, u.created_at, u.last_login_at,
              COALESCE(agg.total_transactions, 0)::int AS total_transactions,
              COALESCE(agg.total_spent, 0)::numeric AS total_spent
         FROM users u
         LEFT JOIN (
           SELECT user_id,
                  COUNT(*)::int AS total_transactions,
                  SUM(grand_total) FILTER (WHERE status = 'SUCCESS') AS total_spent
             FROM orders GROUP BY user_id
         ) agg ON agg.user_id = u.id
         ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );
    const { rows: count } = await query(`SELECT COUNT(*)::int AS total FROM users u ${whereSql}`, params);
    return ok(res, { customers: rows, total: count[0].total, limit, offset });
  },
  { methods: ['GET'], auth: 'admin' }
);
