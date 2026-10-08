'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

function buildFilters(q) {
  const where = [];
  const params = [];
  let i = 1;

  const range = String(q.range || 'all');
  if (range === 'today') {
    where.push(`(o.created_at AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date`);
  } else if (range === 'week') {
    where.push(`o.created_at >= NOW() - INTERVAL '7 days'`);
  } else if (range === 'month') {
    where.push(`o.created_at >= NOW() - INTERVAL '30 days'`);
  } else if (range === 'custom') {
    if (q.from) { where.push(`o.created_at >= $${i++}`); params.push(new Date(q.from)); }
    if (q.to) { where.push(`o.created_at <= $${i++}`); params.push(new Date(new Date(q.to).getTime() + 86399999)); }
  }

  const status = String(q.status || 'all');
  const statusMap = {
    success: `o.status = 'SUCCESS'`,
    pending: `o.status IN ('PENDING','PAID','PROCESSING')`,
    failed: `o.status IN ('FAILED','EXPIRED','CANCELLED')`,
    refunded: `o.status = 'REFUNDED'`,
    paid: `o.payment_status = 'PAID'`,
  };
  if (statusMap[status]) where.push(statusMap[status]);

  if (q.search) {
    where.push(`(o.order_id ILIKE $${i} OR o.game_user_id ILIKE $${i} OR o.product_name ILIKE $${i} OR u.username ILIKE $${i} OR u.email ILIKE $${i})`);
    params.push(`%${q.search}%`);
    i++;
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, nextIndex: i };
}

module.exports = handler(
  async (req, res) => {
    const q = req.query || {};
    const limit = Math.min(Number(q.limit || 25), 100);
    const offset = Math.max(Number(q.offset || 0), 0);
    const { whereSql, params, nextIndex } = buildFilters(q);

    const listSql = `
      SELECT o.id, o.order_id, o.game_user_id, o.game_server_id, o.product_name, o.denomination,
             o.supplier_cost, o.base_price, o.discount_total, o.total_price, o.payment_fee, o.grand_total,
             o.payment_method, o.payment_provider, o.payment_status, o.topup_status, o.status,
             o.supplier_reference, o.referral_code, o.created_at, o.paid_at, o.completed_at,
             g.name AS game_name, g.slug AS game_slug,
             s.name AS supplier_name,
             u.username AS customer_username, u.email AS customer_email, u.phone AS customer_phone
        FROM orders o
        JOIN games g ON g.id = o.game_id
        LEFT JOIN suppliers s ON s.id = o.supplier_id
        LEFT JOIN users u ON u.id = o.user_id
        ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`;

    const { rows } = await query(listSql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(o.grand_total) FILTER (WHERE o.status='SUCCESS'),0)::numeric AS revenue,
             COALESCE(SUM(o.total_price - o.supplier_cost) FILTER (WHERE o.status='SUCCESS'),0)::numeric AS profit
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        ${whereSql}`;
    const { rows: countRows } = await query(countSql, params);

    return ok(res, {
      transactions: rows,
      total: countRows[0].total,
      summary: { revenue: countRows[0].revenue, profit: countRows[0].profit },
      limit,
      offset,
    });
  },
  { methods: ['GET'], auth: 'admin' }
);
