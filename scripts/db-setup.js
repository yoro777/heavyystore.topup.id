'use strict';
/**
 * HEAVY STORE TOP UP — database setup
 * Applies database/schema.sql to the database pointed by DATABASE_URL.
 *
 *   npm run db:setup
 *
 * Safe to run multiple times (schema uses CREATE TABLE IF NOT EXISTS and
 * DROP TRIGGER IF EXISTS guards).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadEnv, sslConfig } = require('./_env');

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('\n[db:setup] DATABASE_URL is not set.');
    console.error('  Copy .env.example to .env and set DATABASE_URL, then retry.\n');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = new Client({ connectionString: url, ssl: sslConfig(url) });
  await client.connect();
  try {
    console.log('[db:setup] Applying schema.sql ...');
    await client.query(sql);
    console.log('[db:setup] Schema applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db:setup] Failed:', err.message);
  process.exit(1);
});
