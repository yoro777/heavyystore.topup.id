'use strict';
/**
 * Public promo feed.
 *  GET /api/promo -> { products: [...], referrals: [...], banner: {...} }
 *
 * Only exposes safe, public data (no supplier_cost, no internal margins).
 * Product prices are computed server-side via the same pricing engine used
 * at checkout, so the promo page can never display a price the server would
 * not honour.
 */
const { handler, ok } = require('../_lib/response');
const { query } = require('../_lib/db');
const { loadSettings, toPublicProduct } = require('../_lib/pricing');

module.exports = handler(
  async (req, res) => {
    const settings = await loadSettings();

    // Active promo products (only from active, non-maintenance games)
    const { rows } = await query(
      `SELECT p.*, g.name AS game_name, g.slug AS game_slug, g.logo_url AS game_logo
         FROM products p
         JOIN games g ON g.id = p.game_id
        WHERE p.is_promo = TRUE
          AND p.is_active = TRUE
          AND g.is_active = TRUE
          AND g.is_maintenance = FALSE
        ORDER BY p.updated_at DESC
        LIMIT 60`
    );

    const products = rows.map((row) => {
      const pub = toPublicProduct(row, settings);
      pub.game = { name: row.game_name, slug: row.game_slug, logo_url: row.game_logo };
      return pub;
    });

    // Public, active referral codes (generic campaigns only, no per-user codes)
    const { rows: referrals } = await query(
      `SELECT code, description, discount_type, discount_value, min_transaction, max_discount
         FROM referrals
        WHERE is_active = TRUE
          AND user_id IS NULL
          AND (start_date IS NULL OR start_date <= NOW())
          AND (end_date   IS NULL OR end_date   >= NOW())
          AND (usage_limit = 0 OR used_count < usage_limit)
        ORDER BY discount_value DESC
        LIMIT 20`
    );

    const banner = {
      title: settings.promo_banner_title || 'PROMO SPESIAL',
      subtitle: settings.promo_banner_subtitle || 'Diskon top up game favoritmu hari ini',
      enabled: settings.promo_banner_enabled !== false,
    };

    return ok(res, { products, referrals, banner });
  },
  { methods: ['GET'], rate: { window: 60, max: 120 } }
);
