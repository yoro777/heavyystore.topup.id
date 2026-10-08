'use strict';
/**
 * HEAVY STORE TOP UP — database seed
 *
 *   npm run db:seed
 *
 * 1. Applies database/seed.sql (games, payment methods, settings, referrals).
 * 2. Generates the product (denomination) catalog for all 26 games using
 *    scripts/catalog.js. Idempotent: existing products (matched by name within
 *    the same game) are left untouched, so admin edits are never overwritten.
 *
 * Selling price is intentionally NOT stored — the server pricing engine
 * computes it from supplier_cost + margin at request time.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadEnv, sslConfig } = require('./_env');
const { CATALOG, DEFAULT_MARGIN, PROMO_MARGIN } = require('./catalog');

loadEnv();

const roundIdr = (v, step = 100) => Math.round(v / step) * step;

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('\n[db:seed] DATABASE_URL is not set.');
    console.error('  Copy .env.example to .env and set DATABASE_URL, then retry.\n');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: sslConfig(url) });
  await client.connect();

  try {
    // ---------------------------------------------------------------- 1. SQL
    const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');
    const sql = fs.readFileSync(seedPath, 'utf8');
    console.log('[db:seed] Applying seed.sql (games, payment methods, settings, referrals) ...');
    await client.query(sql);

    // ------------------------------------------------------------ 2. Products
    // Resolve the default margin from settings (fallback to catalog default).
    let margin = DEFAULT_MARGIN;
    const marginRow = await client.query("SELECT value FROM settings WHERE key = 'default_margin_value'");
    if (marginRow.rows.length && marginRow.rows[0].value != null) {
      margin = Number(marginRow.rows[0].value) || DEFAULT_MARGIN;
    }

    const gamesRes = await client.query('SELECT id, slug FROM games');
    const gameIdBySlug = {};
    for (const g of gamesRes.rows) gameIdBySlug[g.slug] = g.id;

    let inserted = 0;
    let skipped = 0;

    for (const [slug, items] of Object.entries(CATALOG)) {
      const gameId = gameIdBySlug[slug];
      if (!gameId) {
        console.warn(`[db:seed] Game slug "${slug}" not found in DB — skipping.`);
        continue;
      }

      const existing = await client.query('SELECT name FROM products WHERE game_id = $1', [gameId]);
      const existingNames = new Set(existing.rows.map((r) => r.name));

      let sort = 1;
      for (const item of items) {
        if (existingNames.has(item.name)) { skipped++; sort++; continue; }

        const cost = Number(item.cost) || 0;
        const promoPrice = item.promo ? roundIdr(cost * (1 + PROMO_MARGIN / 100)) : null;
        const supplierCode = 'seed-' + slug + '-' + slugify(item.name);

        await client.query(
          `INSERT INTO products
             (game_id, supplier_id, name, denomination, supplier_code, supplier_cost,
              selling_price, margin_type, margin_value, min_price, max_discount,
              promo_price, is_promo, is_active, is_maintenance, stock, sort_order)
           VALUES ($1, NULL, $2, $3, $4, $5, NULL, 'percent', $6, 0, 0, $7, $8, TRUE, FALSE, NULL, $9)`,
          [
            gameId,
            item.name,
            item.name,
            supplierCode,
            cost,
            margin,
            promoPrice,
            Boolean(item.promo),
            sort,
          ]
        );
        inserted++;
        sort++;
      }
    }

    console.log(`[db:seed] Products inserted: ${inserted}, skipped (already present): ${skipped}.`);
    console.log('[db:seed] Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db:seed] Failed:', err.message);
  process.exit(1);
});
