'use strict';
const { query } = require('./db');

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  if (!domain) return '•••';
  const visible = name.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  if (s.length <= 4) return '••••';
  return s.slice(0, 4) + '•'.repeat(Math.max(1, s.length - 7)) + s.slice(-3);
}

/** Public, safe representation of an order (never includes supplier_cost). */
function publicOrder(order, payment, { mask = false } = {}) {
  const out = {
    order_id: order.order_id,
    status: order.status,
    payment_status: order.payment_status,
    topup_status: order.topup_status,
    game: { id: order.game_id, name: order.game_name, slug: order.game_slug, logo_url: order.game_logo },
    product: { id: order.product_id, name: order.product_name, denomination: order.denomination },
    game_user_id: order.game_user_id,
    game_server_id: order.game_server_id,
    game_nickname: order.game_nickname,
    base_price: Number(order.base_price),
    promo_discount: Number(order.promo_discount),
    referral_code: order.referral_code,
    referral_discount: Number(order.referral_discount),
    discount_total: Number(order.discount_total),
    total_price: Number(order.total_price),
    payment_fee: Number(order.payment_fee),
    grand_total: Number(order.grand_total),
    payment_method: order.payment_method,
    supplier_reference: order.supplier_reference,
    customer_email: mask ? maskEmail(order.customer_email) : order.customer_email,
    customer_phone: mask ? maskPhone(order.customer_phone) : order.customer_phone,
    expires_at: order.expires_at,
    paid_at: order.paid_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
  if (payment) {
    let parsed = null;
    try {
      parsed = typeof payment.raw_response === 'string' ? JSON.parse(payment.raw_response) : payment.raw_response;
    } catch (_) { /* ignore */ }
    out.payment_instructions = parsed ? parsed.instructions || null : null;
    out.payment_provider = payment.provider;
    out.payment_reference = payment.provider_reference;
  }
  return out;
}

async function getOrderRow(orderPk) {
  const { rows } = await query(
    `SELECT o.*, g.name AS game_name, g.slug AS game_slug, g.logo_url AS game_logo
       FROM orders o JOIN games g ON g.id = o.game_id
      WHERE o.id = $1`,
    [orderPk]
  );
  return rows[0] || null;
}

async function getLatestPayment(orderPk) {
  const { rows } = await query(
    'SELECT * FROM payments WHERE order_pk = $1 ORDER BY created_at DESC LIMIT 1',
    [orderPk]
  );
  return rows[0] || null;
}

async function getPublicOrder(orderPk, opts = {}) {
  const order = await getOrderRow(orderPk);
  if (!order) return null;
  const payment = await getLatestPayment(orderPk);
  return publicOrder(order, payment, opts);
}

async function getPublicOrderByOrderId(orderId, opts = {}) {
  const { rows } = await query('SELECT id FROM orders WHERE order_id = $1', [orderId]);
  if (!rows[0]) return null;
  return getPublicOrder(rows[0].id, opts);
}

module.exports = { publicOrder, getPublicOrder, getPublicOrderByOrderId, getOrderRow, getLatestPayment, maskEmail, maskPhone };
