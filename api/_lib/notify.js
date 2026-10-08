'use strict';
/**
 * Notification service.
 * - Always stores an in-app notification.
 * - Optionally dispatches email (Resend) / WhatsApp (official gateway) if configured.
 * No fake sending: if a provider is not configured the external step is skipped and logged.
 */
const { query } = require('./db');

const TEMPLATES = {
  order_created: { title: 'Pesanan Dibuat', msg: (o) => `Pesanan ${o.order_id} berhasil dibuat. Selesaikan pembayaran sebelum batas waktu.` },
  payment_paid: { title: 'Pembayaran Berhasil', msg: (o) => `Pembayaran untuk ${o.order_id} berhasil. Pesanan sedang diproses.` },
  processing: { title: 'Top Up Diproses', msg: (o) => `Top up untuk ${o.order_id} sedang diproses ke supplier.` },
  topup_success: { title: 'Top Up Berhasil', msg: (o) => `Top up untuk ${o.order_id} berhasil. Terima kasih telah berbelanja!` },
  topup_failed: { title: 'Top Up Gagal', msg: (o) => `Top up untuk ${o.order_id} gagal. Tim kami akan memproses pengembalian dana.` },
  refunded: { title: 'Dana Dikembalikan', msg: (o) => `Dana untuk pesanan ${o.order_id} telah dikembalikan.` },
  expired: { title: 'Pesanan Kedaluwarsa', msg: (o) => `Pesanan ${o.order_id} telah kedaluwarsa karena melewati batas waktu pembayaran.` },
};

async function createNotification({ userId, orderPk, orderId, type, title, message, channel = 'inapp' }) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, order_pk, order_id, type, title, message, channel, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
    [userId || null, orderPk || null, orderId || null, type, title, message || null, channel]
  );
  return rows[0];
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || !to) return { skipped: true };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    console.warn('[notify:email] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendWhatsApp({ to, message }) {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token || !to) return { skipped: true };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: to, message }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err) {
    console.warn('[notify:whatsapp] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Emit an order notification: in-app + optional external channels.
 * @param {object} order row from orders
 * @param {string} type key of TEMPLATES
 */
async function notifyOrder(order, type, { emailEnabled = false, whatsappEnabled = false } = {}) {
  const tpl = TEMPLATES[type] || { title: 'Notifikasi', msg: () => `Update untuk pesanan ${order.order_id}.` };
  const title = tpl.title;
  const message = tpl.msg(order);

  await createNotification({
    userId: order.user_id,
    orderPk: order.id,
    orderId: order.order_id,
    type,
    title,
    message,
  });

  if (emailEnabled && order.customer_email) {
    await sendEmail({
      to: order.customer_email,
      subject: `[HEAVY STORE TOP UP] ${title}`,
      html: `<p>${message}</p><p>Order ID: <b>${order.order_id}</b></p>`,
    });
  }
  if (whatsappEnabled && order.customer_phone) {
    await sendWhatsApp({ to: order.customer_phone, message: `${title}\n${message}` });
  }
}

module.exports = { createNotification, notifyOrder, sendEmail, sendWhatsApp, TEMPLATES };
