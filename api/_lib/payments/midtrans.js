'use strict';
/**
 * Midtrans Core API adapter (official: https://docs.midtrans.com).
 * Supports: QRIS, Virtual Account (BCA/BNI/BRI/Permata/CIMB), Mandiri e-channel,
 * GoPay, ShopeePay, and c-store (Alfamart/Indomaret).
 *
 * Webhook signature: sha512(order_id + status_code + gross_amount + server_key)
 */
const crypto = require('crypto');
const { httpError } = require('../response');

const code = 'midtrans';

function config() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const isProduction = String(process.env.MIDTRANS_IS_PRODUCTION || 'false') === 'true';
  const baseUrl = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  return { serverKey, isProduction, baseUrl };
}

function isConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY);
}

function authHeader() {
  const { serverKey } = config();
  return 'Basic ' + Buffer.from(`${serverKey}:`).toString('base64');
}

/** Map our payment-method code to a Midtrans charge payload. */
function buildChargePayload(methodCode, order) {
  const amount = Math.round(Number(order.grand_total));
  const base = {
    transaction_details: {
      order_id: order.order_id,
      gross_amount: amount,
    },
    customer_details: {
      first_name: order.customer_name || 'Customer',
      email: order.customer_email || undefined,
      phone: order.customer_phone || undefined,
    },
    item_details: [
      {
        id: String(order.product_id),
        price: amount,
        quantity: 1,
        name: String(order.product_name || 'Top Up').slice(0, 50),
      },
    ],
  };

  switch (methodCode) {
    case 'qris':
      return { ...base, payment_type: 'qris', qris: { acquirer: 'gopay' } };
    case 'gopay':
      return { ...base, payment_type: 'gopay' };
    case 'shopeepay':
      return { ...base, payment_type: 'shopeepay' };
    case 'bca_va':
      return { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: 'bca' } };
    case 'bni_va':
      return { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: 'bni' } };
    case 'bri_va':
      return { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: 'bri' } };
    case 'permata_va':
      return { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: 'permata' } };
    case 'cimb_va':
      return { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: 'cimb' } };
    case 'mandiri_va':
      return {
        ...base,
        payment_type: 'echannel',
        echannel: { bill_info1: 'Pembayaran', bill_info2: 'Top Up Game' },
      };
    case 'alfamart':
      return { ...base, payment_type: 'cstore', cstore: { store: 'alfamart', message: 'Top Up Game' } };
    case 'indomaret':
      return { ...base, payment_type: 'cstore', cstore: { store: 'indomaret', message: 'Top Up Game' } };
    default:
      throw httpError(400, `Metode pembayaran ${methodCode} tidak didukung Midtrans`);
  }
}

/** Normalize Midtrans response into our internal shape. */
function normalizeCharge(methodCode, data) {
  const instructions = {};
  let providerReference = data.transaction_id || null;

  if (data.va_numbers && data.va_numbers[0]) {
    instructions.va_number = data.va_numbers[0].va_number;
    instructions.bank = data.va_numbers[0].bank;
  }
  if (data.permata_va_number) {
    instructions.va_number = data.permata_va_number;
    instructions.bank = 'permata';
  }
  if (data.bill_key) {
    instructions.bill_key = data.bill_key;
    instructions.biller_code = data.biller_code;
    instructions.bank = 'mandiri';
  }
  if (data.actions && data.actions.length) {
    instructions.actions = data.actions;
    const qr = data.actions.find((a) => a.name === 'generate-qr-code');
    if (qr) instructions.qr_url = qr.url;
    const deeplink = data.actions.find((a) => a.name === 'deeplink-redirect');
    if (deeplink) instructions.deeplink = deeplink.url;
  }
  if (data.qr_string) instructions.qr_string = data.qr_string;
  if (data.payment_code) instructions.payment_code = data.payment_code;
  if (data.store) instructions.store = data.store;
  if (data.expiry_time) instructions.expiry_time = data.expiry_time;

  return { providerReference, paymentType: data.payment_type || methodCode, instructions, raw: data };
}

async function createTransaction({ order, method }) {
  const { baseUrl } = config();
  if (!isConfigured()) throw httpError(503, 'Payment gateway Midtrans belum dikonfigurasi');

  const payload = buildChargePayload(method.code, order);
  const res = await fetch(`${baseUrl}/v2/charge`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.status_message || data.error_messages)) || 'Gagal membuat transaksi pembayaran';
    throw httpError(502, Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return normalizeCharge(method.code, data);
}

async function getStatus(orderId) {
  const { baseUrl } = config();
  if (!isConfigured()) throw httpError(503, 'Payment gateway Midtrans belum dikonfigurasi');
  const res = await fetch(`${baseUrl}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, 'Gagal memeriksa status pembayaran');
  return data;
}

/** Verify Midtrans notification signature. */
function verifyWebhookSignature(payload) {
  const { serverKey } = config();
  if (!serverKey) return false;
  const { order_id, status_code, gross_amount, signature_key } = payload || {};
  if (!order_id || !status_code || !gross_amount || !signature_key) return false;
  const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return expected === signature_key;
}

/** Map Midtrans transaction_status -> our payment status. */
function mapStatus(transactionStatus, fraudStatus) {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'challenge' ? 'PENDING' : 'PAID';
    case 'settlement':
      return 'PAID';
    case 'pending':
      return 'PENDING';
    case 'deny':
    case 'cancel':
      return 'FAILED';
    case 'expire':
      return 'EXPIRED';
    case 'refund':
    case 'partial_refund':
      return 'REFUNDED';
    default:
      return 'PENDING';
  }
}

function parseWebhook(payload) {
  return {
    orderId: payload.order_id,
    providerReference: payload.transaction_id || null,
    status: mapStatus(payload.transaction_status, payload.fraud_status),
    transactionStatus: payload.transaction_status,
    method: payload.payment_type,
    amount: Number(payload.gross_amount),
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
  buildChargePayload,
};
