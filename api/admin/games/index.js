'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { validateOrThrow } = require('../../_lib/validate');
const { query } = require('../../_lib/db');
const { slugify } = require('../../_lib/utils');
const { logAudit } = require('../../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const { rows } = await query(`
        SELECT g.*,
               (SELECT COUNT(*)::int FROM products p WHERE p.game_id = g.id) AS product_count
          FROM games g ORDER BY g.sort_order, g.name`);
      return ok(res, { games: rows });
    }

    const data = validateOrThrow(getBody(req), {
      name: { type: 'string', required: true, min: 2, max: 80 },
      slug: { type: 'string', max: 80, nullable: true },
      category: { type: 'enum', values: ['mobile', 'pc', 'console', 'voucher', 'other'], default: 'mobile' },
      publisher: { type: 'string', max: 80, nullable: true },
      logo_url: { type: 'string', max: 300, nullable: true },
      banner_url: { type: 'string', max: 300, nullable: true },
      description: { type: 'string', max: 1000, nullable: true },
      requires_server_id: { type: 'boolean', default: false },
      server_id_label: { type: 'string', max: 40, default: 'Server ID' },
      is_active: { type: 'boolean', default: true },
      is_maintenance: { type: 'boolean', default: false },
      sort_order: { type: 'integer', default: 0 },
    });

    const slug = slugify(data.slug || data.name);
    const dup = await query('SELECT id FROM games WHERE slug = $1', [slug]);
    if (dup.rows.length) throw httpError(409, 'Slug game sudah digunakan');

    const { rows } = await query(
      `INSERT INTO games (name, slug, category, publisher, logo_url, banner_url, description, requires_server_id, server_id_label, is_active, is_maintenance, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.name, slug, data.category, data.publisher, data.logo_url, data.banner_url, data.description, data.requires_server_id, data.server_id_label, data.is_active, data.is_maintenance, data.sort_order]
    );

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'game.create', entity: 'game', entityId: rows[0].id, details: { name: data.name }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { game: rows[0] }, 201);
  },
  { methods: ['GET', 'POST'], auth: 'admin' }
);
