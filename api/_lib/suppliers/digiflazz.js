'use strict';
/**
 * Digiflazz adapter (official reseller API: https://api.digiflazz.com/v1).
 * Signatures:
 *   price list : md5(username + apiKey + "depo")
 *   transaction: md5(username + apiKey + ref_id)
 */
const crypto = require('crypto');
const { httpError } = require('../response');

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('sukses') || s.includes('success')) return 'SUCCESS';
  if (s.includes('gagal') || s.includes('fail')) return 'FAILED';
  if (s.includes('pending')) return 'PROCESSING';
  return 'PROCESSING';
}

/** Build the customer_no Digiflazz expects for a game order. */
function buildCustomerNo(order) {
  if (order.game_server_id) return `${order.game_user_id}${order.game_server_id}`;
  return String(order.game_user_id);
}

function createClient(cfg = {}) {
  const baseUrl = (cfg.apiUrl || process.env.DIGIFLAZZ_API_URL || 'https://api.digiflazz.com/v1').replace(/\/$/, '');
  const username = cfg.username || process.env.DIGIFLAZZ_USERNAME || process.env.SUPPLIER_USERNAME;
  const apiKey = cfg.apiKey || process.env.DIGIFLAZZ_API_KEY || process.env.SUPPLIER_API_KEY;

  function ensureConfigured() {
    if (!username || !apiKey) throw httpError(503, 'Supplier Digiflazz belum dikonfigurasi');
  }

  async function post(path, body) {
    ensureConfigured();
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  return {
    code: 'digiflazz',

    async testConnection() {
      try {
        const sign = md5(username + apiKey + 'depo');
        const { ok, data } = await post('/price-list', { cmd: 'prepaid', username, sign });
        const list = data && data.data;
        if (ok && Array.isArray(list)) return { connected: true, count: list.length };
        const msg = (data && data.data && data.data.message) || 'Gagal terhubung ke Digiflazz';
        return { connected: false, error: msg };
      } catch (err) {
        return { connected: false, error: err.message };
      }
    },

    /**
     * Digiflazz does not expose a universal nickname inquiry for every SKU.
     * We only report validation when the supplier actually returns it — never fake it.
     */
    async validateUserID() {
      return {
        supported: false,
        valid: null,
        nickname: null,
        message: 'Validasi ID tidak tersedia untuk supplier ini. Pastikan ID sudah benar.',
      };
    },

    async createTopup({ order, product }) {
      if (!product || !product.supplier_code) {
        return { status: 'FAILED', message: 'SKU supplier belum diatur untuk produk ini' };
      }
      const refId = order.supplier_reference || order.order_id;
      const sign = md5(username + apiKey + refId);
      const { ok, data } = await post('/transaction', {
        username,
        buyer_sku_code: product.supplier_code,
        customer_no: buildCustomerNo(order),
        ref_id: refId,
        testing: false,
        sign,
      });
      const d = data && data.data;
      if (!ok || !d) {
        return { status: 'FAILED', message: 'Gagal mengirim top up ke supplier', raw: data };
      }
      return {
        status: mapStatus(d.status),
        reference: d.ref_id || refId,
        sn: d.sn || null,
        message: d.message || null,
        raw: data,
      };
    },

    async checkTopupStatus({ order, product }) {
      if (!product || !product.supplier_code) {
        return { status: 'FAILED', message: 'SKU supplier belum diatur untuk produk ini' };
      }
      const refId = order.supplier_reference || order.order_id;
      const sign = md5(username + apiKey + refId);
      const { ok, data } = await post('/transaction', {
        username,
        buyer_sku_code: product.supplier_code,
        customer_no: buildCustomerNo(order),
        ref_id: refId,
        sign,
      });
      const d = data && data.data;
      if (!ok || !d) return { status: 'PROCESSING', message: 'Status belum tersedia', raw: data };
      return {
        status: mapStatus(d.status),
        reference: d.ref_id || refId,
        sn: d.sn || null,
        message: d.message || null,
        raw: data,
      };
    },

    async cancelTopup() {
      return { supported: false, message: 'Pembatalan tidak didukung oleh supplier ini' };
    },
  };
}

module.exports = { createClient, mapStatus, buildCustomerNo };
