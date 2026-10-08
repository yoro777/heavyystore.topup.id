'use strict';
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res) => {
    const { rows } = await query(
      `SELECT id, code, name, type, provider, logo_url, fee_flat, fee_percent, min_amount, max_amount, instructions, sort_order
         FROM payment_methods WHERE is_active = TRUE ORDER BY sort_order, name`
    );
    // No credentials ever leave the server. Fee info is public & applied server-side.
    return ok(res, { methods: rows });
  },
  { methods: ['GET'] }
);
