'use strict';
/**
 * Order lifecycle service — the authoritative state machine.
 *
 *   PENDING -> PAID -> PROCESSING -> SUCCESS
 *                        \-> FAILED / REFUNDED
 *   PENDING -> EXPIRED / CANCELLED
 *
 * Double top-up protection:
 *   - order row is locked with SELECT ... FOR UPDATE before any state change
 *   - a supplier_reference is generated ONCE and reused for every retry
 *   - if the top-up was already dispatched (processed_at set) we only QUERY the
 *     supplier status, we never re-send the top-up
 *   - SUCCESS / FAILED are terminal for the dispatch path
 */
const { withTransaction, query } = require('./db');
const { getSupplierAdapter } = require('./suppliers');
const { notifyOrder } = require('./notify');
const { logAudit } = require('./audit');
const { httpError } = require('./response');

async function loadSettingsMap() {
  const { rows } = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function getOrderContext(client, orderPk) {
  const { rows } = await client.query(
    `SELECT o.*,
            p.supplier_code,
            p.supplier_id  AS product_supplier_id,
            p.name         AS product_name_full,
            g.name         AS game_name,
            g.slug         AS game_slug,
            g.requires_server_id
       FROM orders o
       JOIN products p ON p.id = o.product_id
       JOIN games g ON g.id = o.game_id
      WHERE o.id = $1`,
    [orderPk]
  );
  return rows[0];
}

async function getSupplierRow(client, supplierId) {
  if (!supplierId) return null;
  const { rows } = await client.query('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  return rows[0] || null;
}

/** Mark an order paid (idempotent) and kick off the top-up dispatch. */
async function markPaymentPaid(orderId, paymentInfo = {}) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw httpError(404, 'Order tidak ditemukan');

    // Idempotent: already paid -> no-op
    if (order.payment_status === 'PAID') {
      return { order, alreadyPaid: true };
    }

    const { rows: updated } = await client.query(
      `UPDATE orders
          SET payment_status = 'PAID',
              status = CASE WHEN status = 'PENDING' THEN 'PAID' ELSE status END,
              paid_at = COALESCE(paid_at, NOW()),
              payment_reference = COALESCE($2, payment_reference),
              payment_provider = COALESCE($3, payment_provider)
        WHERE id = $1
        RETURNING *`,
      [order.id, paymentInfo.providerReference || null, paymentInfo.provider || order.payment_provider]
    );

    // Upsert the payment record
    await client.query(
      `INSERT INTO payments (order_pk, order_id, provider, provider_reference, method, amount, fee, status, signature_verified, raw_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PAID',$8,$9)
       ON CONFLICT (provider, provider_reference) WHERE provider_reference IS NOT NULL DO UPDATE
         SET status = 'PAID', signature_verified = EXCLUDED.signature_verified, raw_response = EXCLUDED.raw_response, updated_at = NOW()`,
      [
        order.id,
        order.order_id,
        paymentInfo.provider || order.payment_provider || 'unknown',
        paymentInfo.providerReference || order.order_id,
        paymentInfo.method || order.payment_method,
        paymentInfo.amount != null ? paymentInfo.amount : order.grand_total,
        order.payment_fee || 0,
        Boolean(paymentInfo.signatureVerified),
        paymentInfo.raw ? JSON.stringify(paymentInfo.raw) : null,
      ]
    );

    // Record referral usage once (guarded by unique index on order_pk)
    if (order.referral_code && Number(order.referral_discount) > 0) {
      const { rows: refRows } = await client.query('SELECT * FROM referrals WHERE code = $1', [order.referral_code]);
      const referral = refRows[0];
      if (referral) {
        const ins = await client.query(
          `INSERT INTO referral_usages (referral_id, user_id, order_pk, order_id, discount_amount)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (order_pk) WHERE order_pk IS NOT NULL DO NOTHING
           RETURNING id`,
          [referral.id, order.user_id, order.id, order.order_id, order.referral_discount]
        );
        if (ins.rows.length) {
          await client.query('UPDATE referrals SET used_count = used_count + 1 WHERE id = $1', [referral.id]);
        }
      }
    }

    return { order: updated[0], alreadyPaid: false };
  });

  if (!result.alreadyPaid) {
    const settings = await loadSettingsMap();
    await notifyOrder(result.order, 'payment_paid', {
      emailEnabled: Boolean(settings.notification_email_enabled),
      whatsappEnabled: Boolean(settings.notification_whatsapp_enabled),
    });
    await logAudit({
      actorType: 'system',
      action: 'payment.paid',
      entity: 'order',
      entityId: result.order.order_id,
      details: { provider: paymentInfo.provider, reference: paymentInfo.providerReference },
    });
    // Fire the top-up (best-effort; errors are recorded, not thrown to the webhook)
    try {
      await dispatchTopup(result.order.id, { source: 'payment' });
    } catch (err) {
      console.error('[orderService] dispatchTopup after payment failed:', err.message);
    }
  }
  return result.order;
}

/**
 * Dispatch the top-up to the supplier. Idempotent & safe to retry.
 * @param {number} orderPk
 * @param {object} opts { force?: boolean, source?: string }
 */
async function dispatchTopup(orderPk, opts = {}) {
  // Phase 1: lock + decide
  const decision = await withTransaction(async (client) => {
    const order = await getOrderContext(client, orderPk);
    if (!order) throw httpError(404, 'Order tidak ditemukan');

    if (order.topup_status === 'SUCCESS') return { action: 'skip', reason: 'already_success', order };
    if (order.topup_status === 'FAILED' && !opts.force) return { action: 'skip', reason: 'failed', order };
    if (order.payment_status !== 'PAID') return { action: 'skip', reason: 'unpaid', order };

    // Already dispatched before -> only re-check status (never re-send)
    if (order.processed_at && !opts.force) {
      return { action: 'check', order };
    }

    const reference = order.supplier_reference || order.order_id;
    const { rows } = await client.query(
      `UPDATE orders
          SET topup_status = 'PROCESSING',
              status = CASE WHEN status IN ('PAID','PROCESSING') THEN 'PROCESSING' ELSE status END,
              supplier_reference = COALESCE(supplier_reference, $2),
              processed_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [order.id, reference]
    );
    return { action: 'send', order: rows[0], context: order };
  });

  if (decision.action === 'skip') return decision;

  const orderRow = decision.order;
  const ctx = decision.context || (await withTransaction((c) => getOrderContext(c, orderPk)));

  const supplierRow = await withTransaction((c) => getSupplierRow(c, ctx.supplier_id));
  const adapter = getSupplierAdapter(supplierRow);

  const product = { supplier_code: ctx.supplier_code };
  const orderForSupplier = {
    ...orderRow,
    game_user_id: ctx.game_user_id,
    game_server_id: ctx.game_server_id,
  };

  let res;
  try {
    if (decision.action === 'check') {
      res = await adapter.checkTopupStatus({ order: orderForSupplier, product });
    } else {
      res = await adapter.createTopup({ order: orderForSupplier, product });
    }
  } catch (err) {
    // Do NOT mark failed on network errors — keep PROCESSING so a later status
    // check can resolve it (avoids double top-up and false negatives).
    console.error('[orderService] supplier call error:', err.message);
    await query(`UPDATE orders SET notes = COALESCE(notes,'') || $2 WHERE id = $1`, [
      orderPk,
      `\n[supplier-error ${new Date().toISOString()}] ${err.message}`,
    ]);
    return { action: decision.action, status: 'PROCESSING', error: err.message };
  }

  const mapped = res.status || 'PROCESSING';
  const supplierRef = res.reference || orderRow.supplier_reference || orderRow.order_id;

  await applyTopupStatus(orderPk, mapped, {
    supplierReference: supplierRef,
    sn: res.sn,
    message: res.message,
    raw: res.raw,
  });

  return { action: decision.action, status: mapped, raw: res.raw };
}

/** Apply a top-up status transition + side effects (notifications, audit). */
async function applyTopupStatus(orderPk, topupStatus, meta = {}) {
  const allowed = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED'];
  if (!allowed.includes(topupStatus)) topupStatus = 'PROCESSING';

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderPk]);
    const order = rows[0];
    if (!order) throw httpError(404, 'Order tidak ditemukan');

    // Terminal guard: never move SUCCESS back, never resurrect FAILED->SUCCESS silently
    if (order.topup_status === 'SUCCESS' && topupStatus !== 'SUCCESS') return order;

    let orderStatus = order.status;
    if (topupStatus === 'SUCCESS') orderStatus = 'SUCCESS';
    else if (topupStatus === 'FAILED') orderStatus = 'FAILED';
    else if (topupStatus === 'REFUNDED') orderStatus = 'REFUNDED';
    else if (topupStatus === 'PROCESSING') orderStatus = 'PROCESSING';

    const { rows: upd } = await client.query(
      `UPDATE orders
          SET topup_status = $2,
              status = $3,
              supplier_reference = COALESCE($4, supplier_reference),
              completed_at = CASE WHEN $2 IN ('SUCCESS','FAILED','REFUNDED') THEN NOW() ELSE completed_at END,
              notes = CASE WHEN $5 IS NOT NULL THEN COALESCE(notes,'') || $5 ELSE notes END
        WHERE id = $1
        RETURNING *`,
      [
        order.id,
        topupStatus,
        orderStatus,
        meta.supplierReference || null,
        meta.sn ? `\n[SN ${new Date().toISOString()}] ${meta.sn}` : null,
      ]
    );
    return upd[0];
  });

  const settings = await loadSettingsMap();
  const notifyMap = {
    SUCCESS: 'topup_success',
    FAILED: 'topup_failed',
    REFUNDED: 'refunded',
    PROCESSING: 'processing',
  };
  if (notifyMap[topupStatus] && topupStatus !== 'PROCESSING') {
    await notifyOrder(updated, notifyMap[topupStatus], {
      emailEnabled: Boolean(settings.notification_email_enabled),
      whatsappEnabled: Boolean(settings.notification_whatsapp_enabled),
    });
  }
  await logAudit({
    actorType: 'system',
    action: `topup.${String(topupStatus).toLowerCase()}`,
    entity: 'order',
    entityId: updated.order_id,
    details: { supplierReference: meta.supplierReference, message: meta.message },
  });
  return updated;
}

/** Re-query the supplier for the latest status (used by cron / admin refresh). */
async function refreshTopupStatus(orderPk) {
  return dispatchTopup(orderPk, { source: 'refresh' });
}

/** Expire pending orders past their expiry and cancel them. */
async function expireOrders() {
  const { rows } = await withTransaction(async (client) => {
    const { rows: due } = await client.query(
      `SELECT id, order_id, user_id FROM orders
        WHERE status = 'PENDING' AND payment_status = 'PENDING'
          AND expires_at IS NOT NULL AND expires_at < NOW()
        FOR UPDATE SKIP LOCKED`
    );
    const expired = [];
    for (const o of due) {
      const { rows: upd } = await client.query(
        `UPDATE orders SET status = 'EXPIRED', payment_status = 'EXPIRED'
          WHERE id = $1 AND status = 'PENDING' RETURNING *`,
        [o.id]
      );
      if (upd[0]) expired.push(upd[0]);
    }
    return { rows: expired };
  });

  const settings = await loadSettingsMap();
  for (const o of rows) {
    await notifyOrder(o, 'expired', {
      emailEnabled: Boolean(settings.notification_email_enabled),
      whatsappEnabled: Boolean(settings.notification_whatsapp_enabled),
    });
  }
  return rows;
}

module.exports = {
  markPaymentPaid,
  dispatchTopup,
  applyTopupStatus,
  refreshTopupStatus,
  expireOrders,
  getOrderContext,
  loadSettingsMap,
};
