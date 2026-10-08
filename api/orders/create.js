'use strict';
/**
 * Create an order and its payment transaction.
 * ALL prices, discounts and fees are computed HERE (server-side).
 * The browser only sends identifiers — never prices.
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query, withTransaction } = require('../_lib/db');
const { loadSettings, computeOrderPricing } = require('../_lib/pricing');
const { getProvider } = require('../_lib/payments');
const { generateOrderId, computeFee, randomToken } = require('../_lib/utils');
const { notifyOrder } = require('../_lib/notify');
const { logAudit } = require('../_lib/audit');
const { getPublicOrder } = require('../_lib/serialize');

module.exports = handler(
  async (req, res, ctx) => {
    const body = getBody(req);
    const data = validateOrThrow(body, {
      game_id: { type: 'integer', required: true },
      product_id: { type: 'integer', required: true },
      user_id: { type: 'string', required: true, min: 1, max: 64 },
      server_id: { type: 'string', max: 64, nullable: true },
      payment_method: { type: 'string', required: true, max: 40 },
      referral_code: { type: 'string', max: 40, nullable: true },
      idempotency_key: { type: 'string', max: 80, nullable: true },
      email: { type: 'email', max: 120, nullable: true },
      phone: { type: 'phone', max: 20, nullable: true },
    });

    // Idempotency: return the existing order for a repeated checkout submission.
    if (data.idempotency_key) {
      const { rows } = await query('SELECT id FROM orders WHERE idempotency_key = $1', [data.idempotency_key]);
      if (rows[0]) return ok(res, { order: await getPublicOrder(rows[0].id), idempotent: true });
    }

    const settings = await loadSettings();
    if (settings.maintenance_mode === true) {
      throw httpError(503, settings.maintenance_message || 'Layanan sedang dalam pemeliharaan');
    }

    const { rows: games } = await query('SELECT * FROM games WHERE id = $1', [data.game_id]);
    const game = games[0];
    if (!game || !game.is_active) throw httpError(404, 'Game tidak ditemukan');
    if (game.is_maintenance) throw httpError(423, 'Game sedang dalam perawatan');
    if (game.requires_server_id && !data.server_id) {
      throw httpError(422, `${game.server_id_label || 'Server ID'} wajib diisi`);
    }

    const { rows: products } = await query(
      'SELECT * FROM products WHERE id = $1 AND game_id = $2',
      [data.product_id, game.id]
    );
    const product = products[0];
    if (!product || !product.is_active) throw httpError(404, 'Produk tidak ditemukan');
    if (product.is_maintenance) throw httpError(423, 'Produk sedang dalam perawatan');
    if (product.stock !== null && Number(product.stock) <= 0) throw httpError(409, 'Stok produk habis');

    const { rows: methods } = await query(
      'SELECT * FROM payment_methods WHERE code = $1 AND is_active = TRUE',
      [data.payment_method]
    );
    const method = methods[0];
    if (!method) throw httpError(404, 'Metode pembayaran tidak tersedia');

    let referral = null;
    if (data.referral_code && settings.referral_enabled !== false) {
      const { rows } = await query(
        'SELECT * FROM referrals WHERE upper(code) = upper($1) AND is_active = TRUE',
        [data.referral_code]
      );
      referral = rows[0] || null;
    }

    // ---- server-side pricing ----
    const pricing = computeOrderPricing(product, referral, settings);
    const fee = computeFee(method, pricing.totalPrice);
    const grandTotal = pricing.totalPrice + fee;

    if (Number(method.min_amount) > 0 && grandTotal < Number(method.min_amount)) {
      throw httpError(422, `Minimal transaksi ${method.name} Rp${Number(method.min_amount).toLocaleString('id-ID')}`);
    }
    if (Number(method.max_amount) > 0 && grandTotal > Number(method.max_amount)) {
      throw httpError(422, `Maksimal transaksi ${method.name} Rp${Number(method.max_amount).toLocaleString('id-ID')}`);
    }

    const orderId = generateOrderId();
    const expiresAt = new Date(Date.now() + Number(settings.order_expiry_minutes || 30) * 60000);
    const idempotencyKey = data.idempotency_key || 'srv_' + randomToken(12);

    const customerEmail = (ctx.user && ctx.user.email) || data.email || null;
    const customerPhone = (ctx.user && ctx.user.phone) || data.phone || null;

    const order = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO orders (
           order_id, user_id, game_id, product_id, supplier_id,
           game_user_id, game_server_id,
           product_name, denomination,
           supplier_cost, base_price, promo_discount, referral_code, referral_discount, discount_total,
           total_price, payment_fee, grand_total,
           payment_method, payment_provider, payment_status, topup_status, status,
           idempotency_key, customer_email, customer_phone, expires_at
         ) VALUES (
           $1,$2,$3,$4,$5,
           $6,$7,
           $8,$9,
           $10,$11,$12,$13,$14,$15,
           $16,$17,$18,
           $19,$20,'PENDING','PENDING','PENDING',
           $21,$22,$23,$24
         ) RETURNING *`,
        [
          orderId,
          ctx.user ? ctx.user.id : null,
          game.id,
          product.id,
          product.supplier_id,
          data.user_id,
          data.server_id || null,
          product.name,
          product.denomination || null,
          pricing.supplierCost,
          pricing.basePrice,
          pricing.promoDiscount,
          referral ? referral.code : null,
          pricing.referralDiscount,
          pricing.discountTotal,
          pricing.totalPrice,
          fee,
          grandTotal,
          method.code,
          method.provider,
          idempotencyKey,
          customerEmail,
          customerPhone,
          expiresAt,
        ]
      );
      return rows[0];
    });

    // ---- create the payment transaction with the official gateway ----
    let paymentResult;
    try {
      const provider = getProvider(method.provider);
      paymentResult = await provider.createTransaction({ order, method });
    } catch (err) {
      await query(
        `UPDATE orders SET status = 'CANCELLED', payment_status = 'FAILED',
           notes = COALESCE(notes,'') || $2 WHERE id = $1`,
        [order.id, `\n[payment-create-error ${new Date().toISOString()}] ${err.message}`]
      );
      await logAudit({
        actorType: 'system',
        action: 'order.payment_create_failed',
        entity: 'order',
        entityId: order.order_id,
        details: { error: err.message },
      });
      throw err;
    }

    await query(
      `INSERT INTO payments (order_pk, order_id, provider, provider_reference, method, amount, fee, status, raw_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)
       ON CONFLICT (provider, provider_reference) WHERE provider_reference IS NOT NULL DO UPDATE
         SET raw_response = EXCLUDED.raw_response, updated_at = NOW()`,
      [
        order.id,
        order.order_id,
        method.provider,
        paymentResult.providerReference || order.order_id,
        method.code,
        grandTotal,
        fee,
        JSON.stringify({ instructions: paymentResult.instructions || null, raw: paymentResult.raw || null }),
      ]
    );

    await query('UPDATE orders SET payment_reference = $2, payment_provider = $3 WHERE id = $1', [
      order.id,
      paymentResult.providerReference || order.order_id,
      method.provider,
    ]);

    await notifyOrder(order, 'order_created', {
      emailEnabled: Boolean(settings.notification_email_enabled),
      whatsappEnabled: Boolean(settings.notification_whatsapp_enabled),
    });

    await logAudit({
      actorType: ctx.user ? 'user' : 'system',
      actorId: ctx.user ? ctx.user.id : null,
      action: 'order.create',
      entity: 'order',
      entityId: order.order_id,
      details: { game: game.slug, product: product.name, total: grandTotal },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return ok(res, { order: await getPublicOrder(order.id) }, 201);
  },
  { methods: ['POST'], auth: 'optional', rate: { window: 60, max: 20 } }
);
