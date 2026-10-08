'use strict';
const { handler, ok, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { loadSettings, toPublicProduct } = require('../_lib/pricing');

module.exports = handler(
  async (req, res) => {
    const gameId = req.query.game_id;
    const slug = req.query.game;
    if (!gameId && !slug) throw httpError(400, 'Parameter game_id atau game wajib diisi');

    let game;
    if (gameId) {
      const { rows } = await query('SELECT * FROM games WHERE id = $1 AND is_active = TRUE', [Number(gameId)]);
      game = rows[0];
    } else {
      const { rows } = await query('SELECT * FROM games WHERE slug = $1 AND is_active = TRUE', [slug]);
      game = rows[0];
    }
    if (!game) throw httpError(404, 'Game tidak ditemukan');

    const { rows: products } = await query(
      'SELECT * FROM products WHERE game_id = $1 AND is_active = TRUE ORDER BY sort_order, id',
      [game.id]
    );
    const settings = await loadSettings();
    return ok(res, { game: { id: game.id, name: game.name, slug: game.slug }, products: products.map((p) => toPublicProduct(p, settings)) });
  },
  { methods: ['GET'] }
);
