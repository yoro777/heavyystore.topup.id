'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { validateOrThrow } = require('../../_lib/validate');
const { query } = require('../../_lib/db');
const { logAudit } = require('../../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const where = [];
      const params = [];
      let i = 1;
      if (req.query.game_id) { where.push(`p.game_id = $${i++}`); params.push(Number(req.query.game_id)); }
      if (req.query.search) { where.push(`p.name ILIKE $${i++}`); params.push(`%${req.query.search}%`); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await query(
        `SELECT p.*, g.name AS game_name, g.slug AS game_slug, s.name AS supplier_name
           FROM products p
           JOIN games g ON g.id = p.game_id
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           ${whereSql}
          ORDER BY g.sort_order, p.sort_order, p.id`,
        params
      );
      return ok(res, { products: rows });
    }

    const data = validateOrThrow(getBody(req), {
      game_id: { type: 'integer', required: true },
      supplier_id: { type: 'integer', nullable: true },
      name: { type: 'string', required: true, min: 1, max: 120 },
      denomination: { type: 'string', max: 80, nullable: true },
      supplier_code: { type: 'string', max: 80, nullable: true },
      supplier_cost: { type: 'number', required: true, min: 0 },
      selling_price: { type: 'number', min: 0, nullable: true },
      margin_type: { type: 'enum', values: ['percent', 'fixed'], default: 'percent' },
      margin_value: { type: 'number', default: 8, min: 0 },
      min_price: { type: 'number', default: 0, min: 0 },
      max_discount: { type: 'number', default: 0, min: 0 },
      promo_price: { type: 'number', min: 0, nullable: true },
      is_promo: { type: 'boolean', default: false },
      is_active: { type: 'boolean', default: true },
      is_maintenance: { type: 'boolean', default: false },
      stock: { type: 'integer', nullable: true },
      sort_order: { type: 'integer', default: 0 },
    });

    const game = await query('SELECT id FROM games WHERE id = $1', [data.game_id]);
    if (!game.rows[0]) throw httpError(404, 'Game tidak ditemukan');

    const { rows } = await query(
      `INSERT INTO products (game_id, supplier_id, name, denomination, supplier_code, supplier_cost, selling_price, margin_type, margin_value, min_price, max_discount, promo_price, is_promo, is_active, is_maintenance, stock, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [data.game_id, data.supplier_id || null, data.name, data.denomination, data.supplier_code, data.supplier_cost, data.selling_price, data.margin_type, data.margin_value, data.min_price, data.max_discount, data.promo_price, data.is_promo, data.is_active, data.is_maintenance, data.stock, data.sort_order]
    );

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'product.create', entity: 'product', entityId: rows[0].id, details: { name: data.name }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { product: rows[0] }, 201);
  },
  { methods: ['GET', 'POST'], auth: 'admin' }
);
