'use strict';
/**
 * Server-side payment status verification.
 * Re-checks the gateway directly (never trusts the browser) and, when the
 * gateway reports PAID, advances the order through the normal paid pipeline.
 */
const { handler, ok, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getProvider } = require('../_lib/payments');
const { markPaymentPaid } = require('../_lib/orderService');
const { getPublicOrder } = require('../_lib/serialize');

module.exports = handler(
  async (req, res) => {
    const orderId = String(req.query.order_id || '');
    if (!orderId) throw httpError(400, 'order_id wajib diisi');

    const { rows } = await query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    const order = rows[0];
    if (!order) throw httpError(404, 'Pesanan tidak ditemukan');

    // Only re-verify while still pending to avoid unnecessary gateway calls.
    if (order.payment_status === 'PENDING' && order.payment_provider) {
      try {
        const provider = getProvider(order.payment_provider);
        const statusData = await provider.getStatus(order.order_id);
        const mapped = provider.mapStatus
          ? provider.mapStatus(statusData.transaction_status || statusData.latestTransactionStatus, statusData.fraud_status)
          : null;
        if (mapped === 'PAID') {
          await markPaymentPaid(order.order_id, {
            provider: order.payment_provider,
            providerReference: statusData.transaction_id || order.payment_reference,
            method: order.payment_method,
            amount: order.grand_total,
            signatureVerified: true,
            raw: statusData,
          });
        } else if (mapped === 'EXPIRED' || mapped === 'FAILED') {
          await query(
            `UPDATE orders SET payment_status = $2, status = CASE WHEN status='PENDING' THEN $3 ELSE status END WHERE id = $1`,
            [order.id, mapped, mapped === 'EXPIRED' ? 'EXPIRED' : 'FAILED']
          );
        }
      } catch (err) {
        // Gateway hiccup: return current known state, do not fail the request.
        console.warn('[payment/status] gateway check failed:', err.message);
      }
    }

    return ok(res, { order: await getPublicOrder(order.id) });
  },
  { methods: ['GET'], rate: { window: 60, max: 60 } }
);
