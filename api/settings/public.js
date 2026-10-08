'use strict';
/**
 * Public site settings (only rows flagged is_public = TRUE).
 * Used by the frontend for site name, tagline, announcement, maintenance, etc.
 * Never exposes private/internal settings.
 */
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res) => {
    const { rows } = await query(
      'SELECT key, value FROM settings WHERE is_public = TRUE ORDER BY key'
    );
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    return ok(res, { settings: map });
  },
  { methods: ['GET'], rate: { window: 60, max: 120 } }
);
