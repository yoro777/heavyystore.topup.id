'use strict';
/**
 * End-to-end verification harness for HEAVY STORE TOP UP.
 *
 * Runs the real API handlers against the real PostgreSQL database with mock
 * req/res objects. No network / Vercel CLI required. This proves the security
 * guarantees the spec demands:
 *   - prices & discounts are computed SERVER-SIDE only
 *   - supplier_cost is NEVER leaked to the client
 *   - credentials never leave the server
 *   - the payment gateway is real (503 when unconfigured, never a fake PAID)
 *   - webhook signatures are verified
 *   - no double top-up (idempotency)
 *   - rate limiting is per-route
 *
 * Usage: node scripts/verify.js
 */
const path = require('path');
const { loadEnv } = require('./_env');
loadEnv();

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    fail += 1;
    failures.push(name + (detail ? ` \u2014 ${detail}` : ''));
    console.log(`  \u2717 ${name}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------------------ */
/* Mock req/res                                                        */
/* ------------------------------------------------------------------ */
function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    writableEnded: false,
    _body: null,
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    end(payload) {
      this.writableEnded = true;
      if (payload != null) {
        try { this._body = JSON.parse(payload); } catch (_) { this._body = payload; }
      }
    },
    _headers: headers,
  };
}

async function call(handlerFn, { method = 'GET', query = {}, body = null, headers = {}, route = '/' } = {}) {
  const req = {
    method,
    query,
    body,
    url: route,
    path: route,
    headers: { 'user-agent': 'verify-harness', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = makeRes();
  await handlerFn(req, res);
  return res;
}

function load(rel) {
  return require(path.join(ROOT, rel));
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
(async function main() {
  console.log('HEAVY STORE TOP UP \u2014 verification harness');
  console.log('DB:', (process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':****@'));

  const { query } = load('api/_lib/db');
  const pricing = load('api/_lib/pricing');

  // Deterministic run: reset the fixed-window rate limiter.
  await query('DELETE FROM rate_limits');

  /* -------- 1. Catalog & no-leak checks -------- */
  section('1. Public catalog (no supplier_cost leak)');

  const gamesRes = await call(load('api/games/index.js'), { route: '/api/games' });
  check('GET /api/games -> 200', gamesRes.statusCode === 200, 'status ' + gamesRes.statusCode);
  const games = gamesRes._body.games || [];
  check('returns 26 active games', games.length === 26, 'got ' + games.length);
  check('games payload has no supplier_cost', !JSON.stringify(gamesRes._body).includes('supplier_cost'));
  check('games payload has no api_key/secret', !/api_key|secret|server_key/i.test(JSON.stringify(gamesRes._body)));
  const ff = games.find((g) => g.slug === 'free-fire');
  check('free-fire present with min_price', ff && ff.min_price > 0, JSON.stringify(ff && ff.min_price));

  const prodRes = await call(load('api/products/index.js'), { route: '/api/products', query: { game: 'free-fire' } });
  check('GET /api/products?game=free-fire -> 200', prodRes.statusCode === 200, 'status ' + prodRes.statusCode);
  const products = (prodRes._body.products) || [];
  check('free-fire has products', products.length > 0, 'got ' + products.length);
  check('product payload has no supplier_cost', !JSON.stringify(prodRes._body).includes('supplier_cost'));
  check('every product exposes a numeric price', products.every((p) => typeof p.price === 'number' && p.price > 0));

  const badProd = await call(load('api/products/index.js'), { route: '/api/products', query: {} });
  check('GET /api/products without game -> 400', badProd.statusCode === 400, 'status ' + badProd.statusCode);

  const gameDetail = await call(load('api/games/[id].js'), { route: '/api/games/' + ff.id, query: { id: String(ff.id) } });
  check('GET /api/games/:id -> 200', gameDetail.statusCode === 200, 'status ' + gameDetail.statusCode);

  /* -------- 2. Payment methods -------- */
  section('2. Payment methods (no credentials)');
  const pmRes = await call(load('api/payment/methods.js'), { route: '/api/payment/methods' });
  const methods = pmRes._body.methods || [];
  check('GET /api/payment/methods -> 200', pmRes.statusCode === 200);
  check('returns 13 methods', methods.length === 13, 'got ' + methods.length);
  check('methods payload has no server_key', !/server_key|secret|api_key/i.test(JSON.stringify(pmRes._body)));
  const codes = methods.map((m) => m.code);
  for (const need of ['qris', 'dana', 'ovo', 'gopay', 'bca_va', 'alfamart', 'indomaret']) {
    check(`method "${need}" present`, codes.includes(need));
  }

  /* -------- 3. Public settings & promo -------- */
  section('3. Public settings & promo feed');
  const setRes = await call(load('api/settings/public.js'), { route: '/api/settings/public' });
  check('GET /api/settings/public -> 200', setRes.statusCode === 200);
  check('public settings excludes non-public keys', !JSON.stringify(setRes._body).includes('default_margin_value'));

  const promoRes = await call(load('api/promo/index.js'), { route: '/api/promo' });
  check('GET /api/promo -> 200', promoRes.statusCode === 200);
  check('promo payload has no supplier_cost', !JSON.stringify(promoRes._body).includes('supplier_cost'));
  check('promo exposes referrals array', Array.isArray(promoRes._body.referrals));
  check('promo exposes banner object', typeof promoRes._body.banner === 'object');

  /* -------- 4. Pricing engine invariants -------- */
  section('4. Server-side pricing invariants');
  const settings = await pricing.loadSettings();
  const { rows: prodRows } = await query('SELECT * FROM products WHERE is_active = TRUE');
  let neverBelowCost = true;
  let promoBelowFloor = 0;
  for (const p of prodRows) {
    const pr = pricing.computeOrderPricing(p, null, settings);
    if (pr.totalPrice < pr.supplierCost) neverBelowCost = false;
    if (pr.unitPrice < pr.floor || pr.totalPrice < pr.floor) promoBelowFloor += 1;
  }
  check('no product priced below supplier cost', neverBelowCost);
  check('no product below safety floor (all ' + prodRows.length + ')', promoBelowFloor === 0, promoBelowFloor + ' violations');

  // Referral can never push below the floor
  const { rows: refRows } = await query("SELECT * FROM referrals WHERE code = 'HEAVY10'");
  const heavy10 = refRows[0];
  const sample = prodRows[0];
  const withRef = pricing.computeOrderPricing(sample, heavy10, settings);
  check('referral discount respects safety floor', withRef.totalPrice >= withRef.floor,
    `total ${withRef.totalPrice} floor ${withRef.floor}`);
  check('referral discount capped at max_discount', withRef.referralDiscount <= Number(heavy10.max_discount || Infinity));

  /* -------- 5. Referral validate endpoint -------- */
  section('5. Referral validation');
  const refRes = await call(load('api/referral/validate.js'), {
    route: '/api/referral/validate',
    method: 'POST',
    body: { code: 'HEAVY10', amount: 100000 },
  });
  check('POST /api/referral/validate -> 200', refRes.statusCode === 200, 'status ' + refRes.statusCode);
  check('HEAVY10 is valid for Rp100.000', refRes._body.valid === true, JSON.stringify(refRes._body));
  check('HEAVY10 discount = Rp10.000 (capped)', refRes._body.discount === 10000, 'got ' + refRes._body.discount);
  const refBad = await call(load('api/referral/validate.js'), { route: '/api/referral/validate', method: 'POST', body: { code: 'NOPE123', amount: 100000 } });
  check('unknown referral code -> valid:false', refBad._body.valid === false);

  /* -------- 6. Auth: bootstrap admin, register user -------- */
  section('6. Auth (admin bootstrap + user register)');
  const { rows: adminCount } = await query('SELECT COUNT(*)::int AS c FROM admins');
  if (adminCount[0].c === 0) {
    const bootRes = await call(load('api/auth/admin-bootstrap.js'), {
      route: '/api/auth/admin-bootstrap',
      method: 'POST',
      body: {
        admin_secret: process.env.ADMIN_SECRET,
        username: 'verifyadmin',
        email: 'verifyadmin@example.com',
        password: 'VerifyAdmin#2026',
      },
    });
    check('POST /api/auth/admin-bootstrap -> 201', bootRes.statusCode === 201, 'status ' + bootRes.statusCode + ' ' + JSON.stringify(bootRes._body));
    check('bootstrap created superadmin', bootRes._body.admin && bootRes._body.admin.role === 'superadmin');
  } else {
    check('admin already exists (bootstrap skipped)', true);
  }

  const bootAgain = await call(load('api/auth/admin-bootstrap.js'), {
    route: '/api/auth/admin-bootstrap',
    method: 'POST',
    body: { admin_secret: process.env.ADMIN_SECRET, username: 'x', email: 'x@x.com', password: 'xxxxxxxxxx' },
  });
  check('bootstrap disabled once admin exists -> 403', bootAgain.statusCode === 403, 'status ' + bootAgain.statusCode);

  const uniq = Date.now().toString().slice(-8);
  const regRes = await call(load('api/auth/register.js'), {
    route: '/api/auth/register',
    method: 'POST',
    body: {
      username: 'verify' + uniq,
      email: `verify${uniq}@example.com`,
      phone: '081234567890',
      password: 'VerifyUser#2026',
    },
  });
  check('POST /api/auth/register -> 201', regRes.statusCode === 201, 'status ' + regRes.statusCode + ' ' + JSON.stringify(regRes._body));
  check('register sets HttpOnly auth cookie', /hvy_token=/.test(String(regRes.getHeader('set-cookie'))));
  check('register response hides password_hash', !JSON.stringify(regRes._body).includes('password_hash'));

  const dupeReg = await call(load('api/auth/register.js'), {
    route: '/api/auth/register',
    method: 'POST',
    body: { username: 'verify' + uniq, email: `verify${uniq}@example.com`, phone: '081234567890', password: 'VerifyUser#2026' },
  });
  check('duplicate register -> 409', dupeReg.statusCode === 409, 'status ' + dupeReg.statusCode);

  const loginRes = await call(load('api/auth/admin-login.js'), {
    route: '/api/auth/admin-login',
    method: 'POST',
    body: { identifier: 'verifyadmin', password: 'VerifyAdmin#2026' },
  });
  check('POST /api/auth/admin-login -> 200', loginRes.statusCode === 200, 'status ' + loginRes.statusCode + ' ' + JSON.stringify(loginRes._body));
  const adminCookie = String(loginRes.getHeader('set-cookie') || '').split(';')[0];
  check('admin-login sets hvy_admin cookie', /hvy_admin=/.test(adminCookie));

  const badLogin = await call(load('api/auth/admin-login.js'), {
    route: '/api/auth/admin-login',
    method: 'POST',
    body: { identifier: 'verifyadmin', password: 'wrong-password' },
  });
  check('wrong admin password -> 401', badLogin.statusCode === 401, 'status ' + badLogin.statusCode);

  /* -------- 7. Admin authorization -------- */
  section('7. Admin authorization');
  const noAuth = await call(load('api/admin/dashboard.js'), { route: '/api/admin/dashboard' });
  check('admin endpoint without cookie -> 401', noAuth.statusCode === 401, 'status ' + noAuth.statusCode);
  const withAuth = await call(load('api/admin/dashboard.js'), { route: '/api/admin/dashboard', headers: { cookie: adminCookie } });
  check('admin dashboard with cookie -> 200', withAuth.statusCode === 200, 'status ' + withAuth.statusCode + ' ' + JSON.stringify(withAuth._body).slice(0, 140));
  check('admin dashboard returns stats', withAuth._body.stats && typeof withAuth._body.stats === 'object');

  /* -------- 8. Order creation (server-side pricing) -------- */
  section('8. Order creation (server-side pricing + real gateway)');
  const targetGame = ff;
  // Pick a product comfortably above the QRIS minimum so we reach the gateway step.
  const targetProduct = products.slice().sort((a, b) => b.price - a.price)[0];
  const idem = 'verify_idem_' + Date.now();
  const orderRes = await call(load('api/orders/create.js'), {
    route: '/api/orders/create',
    method: 'POST',
    body: {
      game_id: targetGame.id,
      product_id: targetProduct.id,
      user_id: '123456789',
      server_id: '2001',
      payment_method: 'qris',
      referral_code: 'HEAVY10',
      idempotency_key: idem,
      email: `verify${uniq}@example.com`,
      phone: '081234567890',
    },
  });

  // With an unconfigured gateway the handler must fail with 503 and NEVER fake a PAID.
  check('order create with unconfigured gateway -> 503', orderRes.statusCode === 503, 'status ' + orderRes.statusCode + ' ' + JSON.stringify(orderRes._body));
  check('no fake success on payment failure', orderRes._body.success === false);

  const { rows: created } = await query('SELECT * FROM orders WHERE idempotency_key = $1', [idem]);
  check('order row persisted server-side', created.length === 1, 'rows ' + created.length);
  if (created[0]) {
    const o = created[0];
    check('order marked CANCELLED after payment error', o.status === 'CANCELLED', 'status ' + o.status);
    check('order payment_status FAILED (no fake PAID)', o.payment_status === 'FAILED', o.payment_status);
    check('order topup_status still PENDING', o.topup_status === 'PENDING', o.topup_status);
    check('order stored supplier_cost server-side', Number(o.supplier_cost) > 0);
    // Verify the stored total equals a fresh server-side recomputation
    const { rows: prodFull } = await query('SELECT * FROM products WHERE id = $1', [targetProduct.id]);
    const expect = pricing.computeOrderPricing(prodFull[0], heavy10, settings);
    check('stored total_price == server recomputation', Number(o.total_price) === expect.totalPrice,
      `stored ${o.total_price} expected ${expect.totalPrice}`);
    check('stored grand_total >= total_price', Number(o.grand_total) >= Number(o.total_price));
    check('order id format HVY-YYYYMMDD-XXXXXX', /^HVY-\d{8}-[0-9A-F]{6}$/.test(o.order_id), o.order_id);

    // Public order must never leak supplier_cost
    const pubOrder = await call(load('api/orders/check.js'), { route: '/api/orders/check', method: 'POST', body: { order_id: o.order_id } });
    check('GET order check -> 200', pubOrder.statusCode === 200, 'status ' + pubOrder.statusCode);
    check('public order hides supplier_cost', !JSON.stringify(pubOrder._body).includes('supplier_cost'));
    check('public order masks email', /\u2022/.test(String(pubOrder._body.order && pubOrder._body.order.customer_email)));
  }

  // Idempotency: repeat submission returns the same order, no new row
  const idem2 = 'verify_idem2_' + Date.now();
  await call(load('api/orders/create.js'), {
    route: '/api/orders/create',
    method: 'POST',
    body: { game_id: targetGame.id, product_id: targetProduct.id, user_id: '999', payment_method: 'qris', idempotency_key: idem2 },
  });
  const repeat = await call(load('api/orders/create.js'), {
    route: '/api/orders/create',
    method: 'POST',
    body: { game_id: targetGame.id, product_id: targetProduct.id, user_id: '999', payment_method: 'qris', idempotency_key: idem2 },
  });
  check('repeat checkout is idempotent (no duplicate)', repeat._body.idempotent === true, JSON.stringify(repeat._body).slice(0, 140));
  const { rows: idemRows } = await query('SELECT COUNT(*)::int AS c FROM orders WHERE idempotency_key = $1', [idem2]);
  check('exactly one order for the idempotency key', idemRows[0].c === 1, 'rows ' + idemRows[0].c);

  // Price tampering: client cannot influence price (no price fields accepted)
  const tamperKey = 'verify_tamper_' + Date.now();
  await call(load('api/orders/create.js'), {
    route: '/api/orders/create',
    method: 'POST',
    body: { game_id: targetGame.id, product_id: targetProduct.id, user_id: '1', payment_method: 'qris', total_price: 1, grand_total: 1, idempotency_key: tamperKey },
  });
  const { rows: tamperRows } = await query('SELECT total_price FROM orders WHERE idempotency_key = $1', [tamperKey]);
  check('client-supplied price is ignored (server recomputes)', tamperRows[0] && Number(tamperRows[0].total_price) > 1,
    'stored ' + (tamperRows[0] && tamperRows[0].total_price));

  /* -------- 9. Webhook signature verification -------- */
  section('9. Webhook signature verification');
  const badSig = await call(load('api/webhook/payment.js'), {
    route: '/api/webhook/payment',
    method: 'POST',
    query: { provider: 'midtrans' },
    body: { order_id: 'HVY-00000000-000000', transaction_status: 'settlement', signature_key: 'deadbeef' },
  });
  check('invalid webhook signature -> 403', badSig.statusCode === 403, 'status ' + badSig.statusCode);
  const { rows: whLogs } = await query("SELECT COUNT(*)::int AS c FROM webhook_logs WHERE signature_valid = FALSE");
  check('invalid webhook logged to webhook_logs', whLogs[0].c >= 1, 'rows ' + whLogs[0].c);

  /* -------- 10. No double top-up guard -------- */
  section('10. Double top-up protection');
  const orderService = load('api/_lib/orderService.js');
  const unpaidSkip = await orderService.dispatchTopup(created[0].id, { source: 'verify' });
  check('unpaid order is NOT dispatched to supplier', unpaidSkip.action === 'skip' && unpaidSkip.reason === 'unpaid',
    JSON.stringify(unpaidSkip.action));

  /* -------- 11. Rate limiting (per-route) -------- */
  section('11. Rate limiting (per-route)');
  let got429 = false;
  for (let i = 0; i < 60; i += 1) {
    const r = await call(load('api/referral/validate.js'), { route: '/api/referral/validate', method: 'POST', body: { code: 'HEAVY10', amount: 50000 } });
    if (r.statusCode === 429) { got429 = true; break; }
  }
  check('rate limiter returns 429 after burst', got429);
  // A different route must NOT be affected by the referral burst.
  const otherRoute = await call(load('api/games/index.js'), { route: '/api/games' });
  check('other route unaffected by referral burst', otherRoute.statusCode === 200, 'status ' + otherRoute.statusCode);

  /* -------- 12. Webhook PAID flow + idempotency (valid signature) -------- */
  section('12. Webhook PAID flow + idempotency (valid signature)');
  const crypto = require('crypto');
  const SERVER_KEY = 'test_server_key_verify';
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;

  const whOrderId = 'HVY-20990101-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const grand = 2000;
  const { rows: insWh } = await query(
    `INSERT INTO orders (order_id, game_id, product_id, game_user_id, product_name, supplier_cost,
        base_price, promo_discount, referral_code, referral_discount, discount_total,
        total_price, payment_fee, grand_total, payment_method, payment_provider,
        payment_status, topup_status, status, idempotency_key, expires_at)
     VALUES ($1,$2,$3,'wh_test','Webhook Test',1000,2000,0,'HEAVY10',100,100,$4,0,$4,'qris','midtrans',
        'PENDING','PENDING','PENDING',$5, NOW() + INTERVAL '30 min')
     RETURNING id`,
    [whOrderId, targetGame.id, targetProduct.id, grand, 'wh_' + Date.now()]
  );
  const whPk = insWh[0].id;
  const midtransSig = (orderId, statusCode, grossAmount, key) =>
    crypto.createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${key}`).digest('hex');

  // (a) valid signature but WRONG amount -> must NOT mark paid
  const mismatch = await call(load('api/webhook/payment.js'), {
    route: '/api/webhook/payment',
    method: 'POST',
    query: { provider: 'midtrans' },
    body: { order_id: whOrderId, status_code: '200', gross_amount: '100.00', transaction_status: 'settlement', signature_key: midtransSig(whOrderId, '200', '100.00', SERVER_KEY) },
  });
  check('valid signature but wrong amount -> not paid', mismatch.statusCode === 200 && mismatch._body.processed === false, JSON.stringify(mismatch._body));
  const { rows: afterMismatch } = await query('SELECT payment_status FROM orders WHERE id = $1', [whPk]);
  check('order stays PENDING after amount mismatch', afterMismatch[0].payment_status === 'PENDING', afterMismatch[0].payment_status);

  // (b) valid PAID notification
  const paid = await call(load('api/webhook/payment.js'), {
    route: '/api/webhook/payment',
    method: 'POST',
    query: { provider: 'midtrans' },
    body: { order_id: whOrderId, status_code: '200', gross_amount: '2000.00', transaction_status: 'settlement', transaction_id: 'txn_wh_1', payment_type: 'qris', signature_key: midtransSig(whOrderId, '200', '2000.00', SERVER_KEY) },
  });
  check('valid PAID webhook -> processed', paid.statusCode === 200 && paid._body.processed === true, JSON.stringify(paid._body));
  const { rows: afterPaid } = await query('SELECT payment_status, status, topup_status, processed_at FROM orders WHERE id = $1', [whPk]);
  check('order marked PAID', afterPaid[0].payment_status === 'PAID', afterPaid[0].payment_status);
  check('order advanced to PROCESSING (top-up dispatched once)', afterPaid[0].topup_status === 'PROCESSING', afterPaid[0].topup_status);
  const { rows: payRow } = await query('SELECT status, signature_verified FROM payments WHERE order_pk = $1', [whPk]);
  check('payment row recorded PAID + signature_verified', payRow[0] && payRow[0].status === 'PAID' && payRow[0].signature_verified === true, JSON.stringify(payRow[0]));
  const { rows: refUsage } = await query('SELECT discount_amount FROM referral_usages WHERE order_pk = $1', [whPk]);
  check('referral usage recorded exactly once', refUsage.length === 1 && Number(refUsage[0].discount_amount) === 100, JSON.stringify(refUsage));

  // (c) idempotency: repeat the SAME notification -> no double top-up
  const processedAt1 = afterPaid[0].processed_at;
  const paid2 = await call(load('api/webhook/payment.js'), {
    route: '/api/webhook/payment',
    method: 'POST',
    query: { provider: 'midtrans' },
    body: { order_id: whOrderId, status_code: '200', gross_amount: '2000.00', transaction_status: 'settlement', transaction_id: 'txn_wh_1', payment_type: 'qris', signature_key: midtransSig(whOrderId, '200', '2000.00', SERVER_KEY) },
  });
  check('repeat PAID webhook -> 200', paid2.statusCode === 200, 'status ' + paid2.statusCode);
  const { rows: afterPaid2 } = await query('SELECT topup_status, processed_at FROM orders WHERE id = $1', [whPk]);
  check('no double top-up (processed_at unchanged)', String(afterPaid2[0].processed_at) === String(processedAt1), `${afterPaid2[0].processed_at} vs ${processedAt1}`);
  check('topup_status still PROCESSING (single dispatch)', afterPaid2[0].topup_status === 'PROCESSING', afterPaid2[0].topup_status);
  const { rows: refUsage2 } = await query('SELECT COUNT(*)::int AS c FROM referral_usages WHERE order_pk = $1', [whPk]);
  check('referral usage not double-counted on repeat webhook', refUsage2[0].c === 1, 'rows ' + refUsage2[0].c);

  // cleanup the synthetic webhook order
  await query('DELETE FROM payments WHERE order_pk = $1', [whPk]);
  await query('DELETE FROM orders WHERE id = $1', [whPk]);
  process.env.MIDTRANS_SERVER_KEY = '';

  /* -------- Summary -------- */
  console.log('\n============================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('============================================');

  const { getPool } = load('api/_lib/db');
  try { await getPool().end(); } catch (_) { /* ignore */ }
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nHarness crashed:', err && err.stack ? err.stack : err);
  process.exit(2);
});
