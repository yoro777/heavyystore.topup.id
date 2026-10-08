'use strict';
/**
 * Generic reseller adapter (VIP Reseller / RumahOTP style REST API).
 * Endpoints & auth are configurable so any compatible supplier can be plugged in
 * without touching the order pipeline.
 *
 * Env:
 *   SUPPLIER_API_URL, SUPPLIER_API_KEY, SUPPLIER_USERNAME, SUPPLIER_SECRET
 *   SUPPLIER_TOPUP_PATH   (default /topup)
 *   SUPPLIER_STATUS_PATH  (default /status)
 *   SUPPLIER_VALIDATE_PATH(default /validate)
 *   SUPPLIER_AUTH_STYLE   (query | body | header)  default body
 */
const crypto = require('crypto');
const { httpError } = require('../response');

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
const hmac = (secret, s) => crypto.createHmac('sha256', String(secret)).update(String(s)).digest('hex');

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['success', 'sukses', 'berhasil', 'paid', 'completed'].some((k) => s.includes(k))) return 'SUCCESS';
  if (['fail', 'gagal', 'error', 'cancel'].some((k) => s.includes(k))) return 'FAILED';
  if (['refund'].some((k) => s.includes(k))) return 'REFUNDED';
  return 'PROCESSING';
}

function createClient(cfg = {}) {
  const apiUrl = (cfg.apiUrl || process.env.SUPPLIER_API_URL || '').replace(/\/$/, '');
  const apiKey = cfg.apiKey || process.env.SUPPLIER_API_KEY;
  const username = cfg.username || process.env.SUPPLIER_USERNAME;
  const secret = cfg.secret || process.env.SUPPLIER_SECRET;
  const authStyle = (process.env.SUPPLIER_AUTH_STYLE || 'body').toLowerCase();
  const paths = {
    topup: process.env.SUPPLIER_TOPUP_PATH || '/topup',
    status: process.env.SUPPLIER_STATUS_PATH || '/status',
    validate: process.env.SUPPLIER_VALIDATE_PATH || '/validate',
  };

  function ensureConfigured() {
    if (!apiUrl || !apiKey) throw httpError(503, 'Supplier belum dikonfigurasi');
  }

  function sign(ref) {
    return secret ? hmac(secret, `${apiKey}${ref}`) : md5(`${apiKey}${ref}`);
  }

  async function post(path, payload) {
    ensureConfigured();
    const headers = { 'Content-Type': 'application/json' };
    let url = `${apiUrl}${path}`;
    let body = { ...payload };

    if (authStyle === 'header') {
      headers['X-API-KEY'] = apiKey;
      if (username) headers['X-USERNAME'] = username;
    } else if (authStyle === 'query') {
      const qs = new URLSearchParams({ key: apiKey, ...(username ? { username } : {}) }).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    } else {
      body.key = apiKey;
      if (username) body.username = username;
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  return {
    code: 'vipreseller',

    async testConnection() {
      try {
        const { ok, data } = await post(paths.status, { ref_id: 'TEST-CONNECTION', sign: sign('TEST-CONNECTION') });
        if (ok) return { connected: true, raw: data };
        return { connected: false, error: (data && (data.message || data.msg)) || 'Gagal terhubung' };
      } catch (err) {
        return { connected: false, error: err.message };
      }
    },

    async validateUserID({ product, userId, serverId }) {
      try {
        const target = serverId ? `${userId}${serverId}` : String(userId);
        const { ok, data } = await post(paths.validate, {
          service: product && product.supplier_code,
          target,
          sign: sign(target),
        });
        if (ok && data && (data.nickname || data.name || data.data)) {
          const d = data.data || data;
          return { supported: true, valid: true, nickname: d.nickname || d.name || null, raw: data };
        }
        return { supported: true, valid: false, nickname: null, message: (data && (data.message || data.msg)) || 'ID tidak ditemukan', raw: data };
      } catch (err) {
        return { supported: false, valid: null, nickname: null, message: err.message };
      }
    },

    async createTopup({ order, product }) {
      if (!product || !product.supplier_code) {
        return { status: 'FAILED', message: 'SKU supplier belum diatur untuk produk ini' };
      }
      const refId = order.supplier_reference || order.order_id;
      const target = order.game_server_id ? `${order.game_user_id}${order.game_server_id}` : String(order.game_user_id);
      const { ok, data } = await post(paths.topup, {
        service: product.supplier_code,
        target,
        ref_id: refId,
        sign: sign(refId),
      });
      if (!ok || !data) return { status: 'FAILED', message: 'Gagal mengirim top up', raw: data };
      const d = data.data || data;
      return {
        status: mapStatus(d.status || data.status),
        reference: d.ref_id || data.ref_id || refId,
        sn: d.sn || null,
        message: d.message || data.message || data.msg || null,
        raw: data,
      };
    },

    async checkTopupStatus({ order }) {
      const refId = order.supplier_reference || order.order_id;
      const { ok, data } = await post(paths.status, { ref_id: refId, sign: sign(refId) });
      if (!ok || !data) return { status: 'PROCESSING', message: 'Status belum tersedia', raw: data };
      const d = data.data || data;
      return {
        status: mapStatus(d.status || data.status),
        reference: d.ref_id || refId,
        sn: d.sn || null,
        message: d.message || data.message || null,
        raw: data,
      };
    },

    async cancelTopup({ order }) {
      const refId = order.supplier_reference || order.order_id;
      const { ok, data } = await post('/cancel', { ref_id: refId, sign: sign(refId) });
      if (ok && data) return { supported: true, status: mapStatus((data.data || data).status), raw: data };
      return { supported: false, message: (data && (data.message || data.msg)) || 'Pembatalan gagal', raw: data };
    },
  };
}

module.exports = { createClient, mapStatus };
