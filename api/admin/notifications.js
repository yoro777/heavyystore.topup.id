'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { rows } = await query(
      `SELECT n.*, u.username AS user_username
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: count } = await query('SELECT COUNT(*)::int AS total FROM notifications');
    return ok(res, { notifications: rows, total: count[0].total, limit, offset });
  },
  { methods: ['GET'], auth: 'admin' }
);
