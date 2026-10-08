'use strict';
/**
 * DANA Merchant Open API adapter (official).
 * Docs: https://dashboard.dana.id / DANA Merchant Open API.
 *
 * Flow:
 *   1) POST /v1.0/access-token/b2b        (client credentials) -> accessToken
 *   2) POST /v1.0/debit/payment-host-to-host  -> create payment (QRIS / redirect)
 *   3) GET  /v1.0/debit/status            -> query status
 *
 * Signature (B2B token): base64(hmacSha256(clientSecret, clientId + "|" + timestamp))
 * Signature (API):       base64(hmacSha256(clientSecret, stringToSign))
 *   stringToSign = METHOD + ":" + path + ":" + accessToken + ":" + lower(hex(sha256(minifiedBody))) + ":" + timestamp
 *
 * Settlement uses the registered merchant account. Credentials never reach the client.
 */
const crypto = require('crypto');
const { httpError } = require('../response');

const code = 'dana';

function config() {
  const env = String(process.env.DANA_ENV || 'sandbox').toLowerCase();
  const baseUrl = env === 'production' ? 'https://api.dana.id' : 'https://api.sandbox.dana.id';
  return {
    clientId: process.env.DANA_CLIENT_ID,
    clientSecret: process.env.DANA_CLIENT_SECRET,
    merchantId: process.env.DANA_MERCHANT_ID,
    baseUrl,
  };
}

function isConfigured() {
  const c = config();
  return Boolean(c.clientId && c.clientSecret && c.merchantId);
}

function timestamp() {
  // DANA expects ISO-8601 with +07:00
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().replace('Z', '+07:00');
}

function sha256HexLower(str) {
  return crypto.createHash('sha256').update(str).digest('hex').toLowerCase();
}

function hmacBase64(secret, str) {
  return crypto.createHmac('sha256', secret).update(str).digest('base64');
}

async function getAccessToken() {
  const c = config();
  if (!isConfigured()) throw httpError(503, 'DANA belum dikonfigurasi');
  const ts = timestamp();
  const stringToSign = `${c.clientId}|${ts}`;
  const signature = hmacBase64(c.clientSecret, stringToSign);

  const res = await fetch(`${c.baseUrl}/v1.0/access-token/b2b`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CLIENT-KEY': c.clientId,
      'X-TIMESTAMP': ts,
      'X-SIGNATURE': signature,
    },
    body: JSON.stringify({ grantType: 'client_credentials' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.accessToken) {
    throw httpError(502, (data && data.responseMessage) || 'Gagal mendapatkan access token DANA');
  }
  return data.accessToken;
}

function buildApiSignature(method, path, accessToken, bodyObj, ts) {
  const c = config();
  const minified = JSON.stringify(bodyObj);
  const stringToSign = `${method}:${path}:${accessToken}:${sha256HexLower(minified)}:${ts}`;
  return hmacBase64(c.clientSecret, stringToSign);
}

async function createTransaction({ order, method }) {
  const c = config();
  if (!isConfigured()) throw httpError(503, 'DANA belum dikonfigurasi');
  const accessToken = await getAccessToken();

  const path = '/v1.0/debit/payment-host-to-host';
  const body = {
    partnerReferenceNo: order.order_id,
    amount: { value: Number(order.grand_total).toFixed(2), currency: 'IDR' },
    merchantId: c.merchantId,
    validityPeriod: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    additionalInfo: {
      orderTitle: String(order.product_name || 'Top Up').slice(0, 32),
      merchantId: c.merchantId,
      paymentType: method && method.code === 'qris' ? 'QRIS' : 'DANA_WALLET',
    },
  };
  const ts = timestamp();
  const signature = buildApiSignature('POST', path, accessToken, body, ts);

  const res = await fetch(`${c.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-PARTNER-ID': c.clientId,
      'X-EXTERNAL-ID': order.order_id,
      'X-TIMESTAMP': ts,
      'X-SIGNATURE': signature,
      'CHANNEL-ID': '95221',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw httpError(502, (data && data.responseMessage) || 'Gagal membuat transaksi DANA');
  }

  const instructions = {};
  if (data.webRedirectUrl) instructions.deeplink = data.webRedirectUrl;
  if (data.additionalInfo && data.additionalInfo.qrContent) {
    instructions.qr_string = data.additionalInfo.qrContent;
  }
  return {
    providerReference: data.referenceNo || data.partnerReferenceNo || order.order_id,
    paymentType: 'DANA',
    instructions,
    raw: data,
  };
}

async function getStatus(providerReference) {
  const c = config();
  if (!isConfigured()) throw httpError(503, 'DANA belum dikonfigurasi');
  const accessToken = await getAccessToken();
  const path = '/v1.0/debit/status';
  const body = { originalReferenceNo: providerReference, merchantId: c.merchantId };
  const ts = timestamp();
  const signature = buildApiSignature('POST', path, accessToken, body, ts);

  const res = await fetch(`${c.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-PARTNER-ID': c.clientId,
      'X-EXTERNAL-ID': providerReference,
      'X-TIMESTAMP': ts,
      'X-SIGNATURE': signature,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, 'Gagal memeriksa status DANA');
  return data;
}

/**
 * Verify DANA notification signature.
 * DANA sends X-SIGNATURE = base64(hmacSha256(clientSecret, stringToSign)) where
 * stringToSign = "<httpMethod>:<relativePath>:<lower(hex(sha256(minifiedBody))):<timestamp>"
 * (accessToken is not part of notification signature).
 */
function verifyWebhookSignature(payload, headers = {}) {
  const c = config();
  if (!c.clientSecret) return false;
  const received = headers['x-signature'] || headers['X-SIGNATURE'];
  const ts = headers['x-timestamp'] || headers['X-TIMESTAMP'];
  if (!received || !ts) return false;
  const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const stringToSign = `${(headers['x-http-method'] || 'POST').toUpperCase()}:/v1.0/debit/notify:${sha256HexLower(bodyStr)}:${ts}`;
  const expected = hmacBase64(c.clientSecret, stringToSign);
  return expected === received;
}

function mapStatus(status) {
  const s = String(status || '').toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'PAID'].includes(s)) return 'PAID';
  if (['FAILED', 'CANCELLED', 'CLOSED'].includes(s)) return 'FAILED';
  if (['EXPIRED'].includes(s)) return 'EXPIRED';
  if (['REFUNDED'].includes(s)) return 'REFUNDED';
  return 'PENDING';
}

function parseWebhook(payload) {
  return {
    orderId: payload.partnerReferenceNo || payload.originalPartnerReferenceNo,
    providerReference: payload.originalReferenceNo || payload.referenceNo || null,
    status: mapStatus(payload.transactionStatusDesc || payload.latestTransactionStatus),
    transactionStatus: payload.transactionStatusDesc || payload.latestTransactionStatus,
    method: 'dana',
    amount: payload.amount ? Number(payload.amount.value) : undefined,
    raw: payload,
  };
}

module.exports = {
  code,
  isConfigured,
  createTransaction,
  getStatus,
  verifyWebhookSignature,
  parseWebhook,
  mapStatus,
  getAccessToken,
};
