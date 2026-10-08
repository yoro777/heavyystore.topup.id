'use strict';
/**
 * Public order lookup by Order ID (used by the "Cek Pesanan" page).
 * Contact details are masked for privacy.
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { getPublicOrder } = require('../_lib/serialize');

module.exports = handler(
  async (req, res) => {
    const body = req.method === 'POST' ? getBody(req) : req.query;
    const data = validateOrThrow(body, {
      order_id: { type: 'string', required: true, min: 4, max: 60 },
    });

    const { rows } = await query('SELECT id FROM orders WHERE order_id = $1', [data.order_id.trim()]);
    if (!rows[0]) throw httpError(404, 'Pesanan tidak ditemukan. Periksa kembali Order ID Anda.');

    return ok(res, { order: await getPublicOrder(rows[0].id, { mask: true }) });
  },
  { methods: ['GET', 'POST'], rate: { window: 60, max: 30 } }
);
