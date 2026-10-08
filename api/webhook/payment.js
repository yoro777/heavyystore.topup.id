'use strict';
/**
 * Payment gateway webhook.
 * - Verifies the gateway signature before trusting anything.
 * - Idempotent: repeated notifications never double-process an order.
 * - On PAID it advances the order and dispatches the top-up exactly once.
 */
const { handler, ok, fail, getBody, getClientIp } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getProvider } = require('../_lib/payments');
const { markPaymentPaid } = require('../_lib/orderService');

async function logWebhook(fields) {
  try {
    await query(
      `INSERT INTO webhook_logs (source, event, reference, signature_valid, processed, error, payload, ip)
       VALUES ('payment',$1,$2,$3,$4,$5,$6,$7)`,
      [
        fields.event || null,
        fields.reference || null,
        Boolean(fields.signatureValid),
        Boolean(fields.processed),
        fields.error || null,
        fields.payload ? JSON.stringify(fields.payload) : null,
        fields.ip || null,
      ]
    );
  } catch (err) {
    console.warn('[webhook:payment] log failed:', err.message);
  }
}

module.exports = handler(
  async (req, res, ctx) => {
    const body = getBody(req);
    const providerName = String(req.query.provider || '').toLowerCase();

    let provider;
    try {
      if (providerName) provider = getProvider(providerName);
      else if (body.signature_key) provider = getProvider('midtrans');
      else provider = getProvider(process.env.PAYMENT_PROVIDER || 'midtrans');
    } catch (err) {
      await logWebhook({ error: err.message, payload: body, ip: ctx.ip });
      return fail(res, 400, 'Provider pembayaran tidak dikenal');
    }

    const signatureValid = provider.verifyWebhookSignature(body, req.headers);
    if (!signatureValid) {
      await logWebhook({ event: 'invalid_signature', payload: body, signatureValid: false, ip: ctx.ip });
      return fail(res, 403, 'Signature tidak valid');
    }

    const parsed = provider.parseWebhook(body);
    if (!parsed.orderId) {
      await logWebhook({ event: 'missing_order', payload: body, signatureValid: true, ip: ctx.ip });
      return fail(res, 400, 'order_id tidak ditemukan pada payload');
    }

    const { rows } = await query('SELECT id, payment_status, grand_total FROM orders WHERE order_id = $1', [parsed.orderId]);
    const order = rows[0];
    if (!order) {
      await logWebhook({ event: parsed.transactionStatus, reference: parsed.orderId, payload: body, signatureValid: true, ip: ctx.ip });
      return ok(res, { message: 'Order tidak ditemukan, diabaikan' });
    }

    // Amount integrity: a PAID notification must match the amount we charged.
    // Prevents a valid-signature notification with a tampered/partial amount
    // from marking an order as fully paid.
    if (
      parsed.status === 'PAID' &&
      parsed.amount != null &&
      Number.isFinite(parsed.amount) &&
      Math.round(parsed.amount) !== Math.round(Number(order.grand_total))
    ) {
      await logWebhook({
        event: 'amount_mismatch',
        reference: parsed.orderId,
        signatureValid: true,
        processed: false,
        error: `amount ${parsed.amount} != grand_total ${order.grand_total}`,
        payload: body,
        ip: ctx.ip,
      });
      // 200 so the gateway stops retrying a permanently-invalid notification.
      return ok(res, { message: 'Jumlah tidak cocok, diabaikan', processed: false });
    }

    let processed = false;
    let error = null;
    try {
      if (parsed.status === 'PAID') {
        await markPaymentPaid(parsed.orderId, {
          provider: provider.code,
          providerReference: parsed.providerReference,
          method: parsed.method,
          amount: parsed.amount,
          signatureVerified: true,
          raw: parsed.raw,
        });
        processed = true;
      } else if (parsed.status === 'EXPIRED' || parsed.status === 'FAILED') {
        // Only downgrade orders that are still pending (never touch a paid order).
        if (order.payment_status === 'PENDING') {
          await query(
            `UPDATE orders SET payment_status = $2, status = CASE WHEN status = 'PENDING' THEN $3 ELSE status END WHERE id = $1`,
            [order.id, parsed.status, parsed.status === 'EXPIRED' ? 'EXPIRED' : 'FAILED']
          );
        }
        processed = true;
      } else if (parsed.status === 'REFUNDED') {
        await query(`UPDATE orders SET payment_status = 'REFUNDED', status = 'REFUNDED' WHERE id = $1`, [order.id]);
        processed = true;
      }
    } catch (err) {
      error = err.message;
      console.error('[webhook:payment] processing error:', err.message);
    }

    await logWebhook({
      event: parsed.transactionStatus,
      reference: parsed.orderId,
      signatureValid: true,
      processed,
      error,
      payload: body,
      ip: ctx.ip,
    });

    // Always 200 for valid signatures so the gateway stops retrying on our logic errors.
    return ok(res, { message: 'OK', processed });
  },
  { methods: ['POST'], rate: false }
);
