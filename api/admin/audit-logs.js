'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const where = [];
    const params = [];
    let i = 1;
    if (req.query.actor_type) { where.push(`actor_type = $${i++}`); params.push(req.query.actor_type); }
    if (req.query.action) { where.push(`action ILIKE $${i++}`); params.push(`%${req.query.action}%`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );
    const { rows: count } = await query(`SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`, params);
    return ok(res, { logs: rows, total: count[0].total, limit, offset });
  },
  { methods: ['GET'], auth: 'admin' }
);
