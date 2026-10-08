'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');
const { loadSettings, toPublicProduct } = require('../_lib/pricing');

module.exports = handler(
  async (req, res) => {
    const { rows: games } = await query(
      'SELECT * FROM games WHERE is_active = TRUE ORDER BY sort_order, name'
    );
    const { rows: products } = await query(
      'SELECT * FROM products WHERE is_active = TRUE AND is_maintenance = FALSE'
    );
    const settings = await loadSettings();

    const byGame = {};
    for (const p of products) {
      const pub = toPublicProduct(p, settings);
      if (!byGame[p.game_id]) byGame[p.game_id] = { min: Infinity, count: 0 };
      byGame[p.game_id].min = Math.min(byGame[p.game_id].min, pub.price);
      byGame[p.game_id].count += 1;
    }

    const data = games.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      category: g.category,
      publisher: g.publisher,
      logo_url: g.logo_url,
      description: g.description,
      requires_server_id: g.requires_server_id,
      server_id_label: g.server_id_label,
      is_maintenance: g.is_maintenance,
      product_count: (byGame[g.id] && byGame[g.id].count) || 0,
      min_price: byGame[g.id] && isFinite(byGame[g.id].min) ? byGame[g.id].min : null,
    }));

    return ok(res, { games: data });
  },
  { methods: ['GET'] }
);
