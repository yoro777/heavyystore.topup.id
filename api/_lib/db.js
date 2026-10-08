'use strict';
/**
 * PostgreSQL connection pool (singleton, safe for serverless warm reuse).
 */
const { Pool } = require('pg');

let pool = null;

function buildConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const err = new Error('DATABASE_URL is not configured');
    err.statusCode = 500;
    throw err;
  }
  const useSsl =
    /sslmode=require|sslmode=prefer|ssl=true/i.test(connectionString) ||
    process.env.PGSSL === 'true' ||
    process.env.NODE_ENV === 'production';

  const cfg = {
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
  if (useSsl) cfg.ssl = { rejectUnauthorized: false };
  return cfg;
}

function getPool() {
  if (!pool) pool = new Pool(buildConfig());
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

/** Run a callback inside a transaction with row-locking support. */
async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, query, withTransaction };
