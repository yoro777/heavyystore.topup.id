'use strict';
/**
 * Payment gateway abstraction.
 * Add a new gateway by dropping a module here and registering it below.
 * Official APIs only — no scraping, no fake statuses.
 */
const midtrans = require('./midtrans');
const dana = require('./dana');

const PROVIDERS = { midtrans, dana };

function getProvider(name) {
  const key = String(name || process.env.PAYMENT_PROVIDER || 'midtrans').toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    const err = new Error(`Payment provider tidak dikenal: ${key}`);
    err.statusCode = 500;
    throw err;
  }
  return provider;
}

module.exports = { getProvider, PROVIDERS };
