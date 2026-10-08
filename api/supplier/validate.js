'use strict';
/**
 * Validate a game User ID against the supplier (when the supplier supports it).
 * Never fakes a result: if the supplier cannot validate, we say so.
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { getSupplierAdapter } = require('../_lib/suppliers');

module.exports = handler(
  async (req, res) => {
    const body = getBody(req);
    const data = validateOrThrow(body, {
      game_id: { type: 'integer', required: true },
      user_id: { type: 'string', required: true, min: 1, max: 64 },
      server_id: { type: 'string', max: 64, nullable: true },
    });

    const { rows: games } = await query('SELECT * FROM games WHERE id = $1 AND is_active = TRUE', [data.game_id]);
    const game = games[0];
    if (!game) throw httpError(404, 'Game tidak ditemukan');
    if (game.is_maintenance) throw httpError(423, 'Game sedang dalam perawatan');

    const { rows: products } = await query(
      'SELECT * FROM products WHERE game_id = $1 AND is_active = TRUE ORDER BY sort_order LIMIT 1',
      [game.id]
    );
    const product = products[0];
    if (!product) throw httpError(404, 'Belum ada produk untuk game ini');

    const supplierRow = product.supplier_id
      ? (await query('SELECT * FROM suppliers WHERE id = $1', [product.supplier_id])).rows[0]
      : null;

    const adapter = getSupplierAdapter(supplierRow);
    const result = await adapter.validateUserID({
      game,
      product,
      userId: data.user_id,
      serverId: data.server_id,
    });

    return ok(res, { validation: result });
  },
  { methods: ['POST'], rate: { window: 60, max: 40 } }
);
