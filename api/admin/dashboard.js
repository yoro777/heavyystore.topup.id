'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res) => {
    const { rows: statsRows } = await query(`
      SELECT
        COUNT(*)::int AS total_transactions,
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date)::int AS today_transactions,
        COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
        COUNT(*) FILTER (WHERE status IN ('PENDING','PAID','PROCESSING'))::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('FAILED','EXPIRED','CANCELLED'))::int AS failed,
        COUNT(*) FILTER (WHERE status = 'REFUNDED')::int AS refunded,
        COALESCE(SUM(grand_total) FILTER (WHERE status = 'SUCCESS'), 0)::numeric AS revenue,
        COALESCE(SUM(total_price - supplier_cost) FILTER (WHERE status = 'SUCCESS'), 0)::numeric AS profit,
        COALESCE(SUM(grand_total) FILTER (WHERE status = 'SUCCESS' AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date), 0)::numeric AS revenue_today
      FROM orders
    `);

    const { rows: counts } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS customers,
        (SELECT COUNT(*)::int FROM users WHERE status = 'active') AS active_customers,
        (SELECT COUNT(*)::int FROM products) AS products,
        (SELECT COUNT(*)::int FROM products WHERE is_active) AS active_products,
        (SELECT COUNT(*)::int FROM games) AS games
    `);

    const { rows: chart } = await query(`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(o.id), 0)::int AS count,
             COALESCE(SUM(o.grand_total) FILTER (WHERE o.status = 'SUCCESS'), 0)::numeric AS revenue,
             COALESCE(SUM(o.total_price - o.supplier_cost) FILTER (WHERE o.status = 'SUCCESS'), 0)::numeric AS profit
        FROM generate_series(
               (NOW() AT TIME ZONE 'Asia/Jakarta')::date - INTERVAL '13 days',
               (NOW() AT TIME ZONE 'Asia/Jakarta')::date,
               INTERVAL '1 day'
             ) AS d(day)
        LEFT JOIN orders o
          ON (o.created_at AT TIME ZONE 'Asia/Jakarta')::date = d.day
       GROUP BY d.day
       ORDER BY d.day
    `);

    const { rows: recent } = await query(`
      SELECT order_id, product_name, game_user_id, grand_total, status, payment_status, topup_status, created_at
        FROM orders ORDER BY created_at DESC LIMIT 8
    `);

    return ok(res, {
      stats: { ...statsRows[0], ...counts[0] },
      chart,
      recent,
    });
  },
  { methods: ['GET'], auth: 'admin' }
);
