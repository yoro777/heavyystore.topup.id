'use strict';
/**
 * Minimal .env loader (no external dependency).
 * Loads KEY=VALUE pairs from the project root `.env` into process.env.
 * Existing environment variables always win (so Vercel/CI values are kept).
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

/** Build the SSL option from the connection string / environment. */
function sslConfig(connectionString) {
  const useSsl =
    /sslmode=require|sslmode=prefer|ssl=true/i.test(connectionString || '') ||
    process.env.PGSSL === 'true' ||
    process.env.NODE_ENV === 'production';
  return useSsl ? { rejectUnauthorized: false } : false;
}

module.exports = { loadEnv, sslConfig };
