'use strict';
/**
 * Supplier provider abstraction.
 * Resolves an adapter from a DB supplier row (or env fallback) and decrypts secrets.
 */
const digiflazz = require('./digiflazz');
const vipreseller = require('./vipreseller');
const { decrypt } = require('../crypto');
const { httpError } = require('../response');

const ADAPTERS = {
  digiflazz,
  vipreseller,
  generic: vipreseller,
};

function safeDecrypt(value) {
  if (!value) return null;
  try { return decrypt(value); } catch (_) { return null; }
}

/**
 * @param {object|null} supplierRow row from `suppliers` (may be null -> env fallback)
 * @returns adapter client with validateUserID/createTopup/checkTopupStatus/cancelTopup/testConnection
 */
function getSupplierAdapter(supplierRow) {
  const code = String(
    (supplierRow && supplierRow.code) || process.env.SUPPLIER_ADAPTER || 'digiflazz'
  ).toLowerCase();

  const adapter = ADAPTERS[code];
  if (!adapter) throw httpError(500, `Supplier adapter tidak dikenal: ${code}`);

  const cfg = {
    apiUrl: (supplierRow && supplierRow.api_url) || process.env.SUPPLIER_API_URL,
    apiKey: safeDecrypt(supplierRow && supplierRow.api_key) || process.env.SUPPLIER_API_KEY,
    username: (supplierRow && supplierRow.username) || process.env.SUPPLIER_USERNAME,
    secret: safeDecrypt(supplierRow && supplierRow.secret) || process.env.SUPPLIER_SECRET,
  };

  return adapter.createClient(cfg);
}

module.exports = { getSupplierAdapter, ADAPTERS };
