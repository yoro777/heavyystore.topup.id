'use strict';
const { handler, ok, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { loadSettings, toPublicProduct } = require('../_lib/pricing');

module.exports = handler(
  async (req, res) => {
    const raw = String(req.query.id || '');
    const isNumeric = /^\d+$/.test(raw);
    const { rows } = await query(
      `SELECT * FROM games WHERE ${isNumeric ? 'id = $1' : 'slug = $1'} AND is_active = TRUE`,
      [isNumeric ? Number(raw) : raw]
    );
    const game = rows[0];
    if (!game) throw httpError(404, 'Game tidak ditemukan');

    const { rows: products } = await query(
      'SELECT * FROM products WHERE game_id = $1 AND is_active = TRUE ORDER BY sort_order, id',
      [game.id]
    );
    const settings = await loadSettings();
    const publicProducts = products.map((p) => toPublicProduct(p, settings));

    return ok(res, {
      game: {
        id: game.id,
        name: game.name,
        slug: game.slug,
        category: game.category,
        publisher: game.publisher,
        logo_url: game.logo_url,
        banner_url: game.banner_url,
        description: game.description,
        requires_server_id: game.requires_server_id,
        server_id_label: game.server_id_label,
        is_maintenance: game.is_maintenance,
      },
      products: publicProducts,
    });
  },
  { methods: ['GET'] }
);
