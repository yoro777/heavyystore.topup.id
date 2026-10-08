'use strict';
/**
 * Dynamic pricing engine — SERVER-SIDE AUTHORITATIVE.
 *
 * Guarantees:
 *  - final price is always >= supplier_cost + minimum margin (never a loss)
 *  - promo can never drop below the safety floor
 *  - referral discount is capped by max_discount AND by the safety floor
 *  - supplier_cost is NEVER exposed to the client
 */
const { query } = require('./db');

const FALLBACK = {
  default_margin_type: 'percent',
  default_margin_value: 8,
  min_margin_percent: 3,
};

async function loadSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return { ...FALLBACK, ...map };
}

function roundIdr(value, step = 100) {
  return Math.round(value / step) * step;
}

/** Round UP to the nearest step — used when enforcing a floor so rounding can
 *  never push a price below the safety floor. */
function ceilIdr(value, step = 100) {
  return Math.ceil(value / step) * step;
}

function minMarginAmount(cost, settings) {
  const pct = Number(settings.min_margin_percent ?? FALLBACK.min_margin_percent);
  return Math.ceil((cost * pct) / 100);
}

/** Absolute floor: below this the store would lose money. */
function safetyFloor(product, settings) {
  const cost = Number(product.supplier_cost) || 0;
  return Math.max(cost + minMarginAmount(cost, settings), Number(product.min_price) || 0);
}

/** Compute the base (pre-discount) selling price. */
function computeBasePrice(product, settings) {
  const cost = Number(product.supplier_cost) || 0;
  let price;
  if (product.selling_price != null && Number(product.selling_price) > 0) {
    price = Number(product.selling_price);
  } else {
    const type = product.margin_type || settings.default_margin_type || 'percent';
    const val = Number(product.margin_value ?? settings.default_margin_value ?? 8);
    price = type === 'percent' ? cost * (1 + val / 100) : cost + val;
  }
  price = roundIdr(price, 100);
  const floor = safetyFloor(product, settings);
  if (price < floor) price = ceilIdr(floor, 100);
  return { cost, basePrice: price, floor };
}

/** Apply product-level promo (explicit promo_price) without breaking the floor. */
function applyPromo(basePrice, product, floor) {
  let price = basePrice;
  let promoDiscount = 0;
  if (product.is_promo && product.promo_price != null && Number(product.promo_price) > 0) {
    const pp = roundIdr(Number(product.promo_price), 100);
    if (pp < price && pp >= floor) {
      promoDiscount = price - pp;
      price = pp;
    }
  }
  return { price, promoDiscount };
}

/** Validate + compute a referral discount for a given price. */
function computeReferralDiscount(referral, price, floor) {
  if (!referral) return 0;
  const now = Date.now();
  if (!referral.is_active) return 0;
  if (referral.start_date && now < new Date(referral.start_date).getTime()) return 0;
  if (referral.end_date && now > new Date(referral.end_date).getTime()) return 0;
  if (Number(referral.usage_limit) > 0 && Number(referral.used_count) >= Number(referral.usage_limit)) return 0;
  if (price < Number(referral.min_transaction || 0)) return 0;

  let disc =
    referral.discount_type === 'percent'
      ? (price * Number(referral.discount_value || 0)) / 100
      : Number(referral.discount_value || 0);

  const maxDisc = Number(referral.max_discount || 0);
  if (maxDisc > 0) disc = Math.min(disc, maxDisc);

  // Never drop below the safety floor.
  const maxAllowed = Math.max(0, price - floor);
  disc = Math.min(disc, maxAllowed);
  return Math.max(0, Math.round(disc));
}

/**
 * Full server-side order pricing.
 * @returns {{ supplierCost, basePrice, unitPrice, promoDiscount, referralDiscount, discountTotal, totalPrice, floor }}
 */
function computeOrderPricing(product, referral, settings) {
  const { cost, basePrice, floor } = computeBasePrice(product, settings);
  const promo = applyPromo(basePrice, product, floor);
  const referralDiscount = computeReferralDiscount(referral, promo.price, floor);
  const totalPrice = Math.max(ceilIdr(floor, 100), promo.price - referralDiscount);
  return {
    supplierCost: cost,
    basePrice,
    unitPrice: promo.price,
    promoDiscount: promo.promoDiscount,
    referralDiscount,
    discountTotal: promo.promoDiscount + referralDiscount,
    totalPrice,
    floor,
  };
}

/** Public (safe) product representation — hides supplier_cost. */
function toPublicProduct(product, settings) {
  const { basePrice, floor } = computeBasePrice(product, settings);
  const promo = applyPromo(basePrice, product, floor);
  return {
    id: product.id,
    game_id: product.game_id,
    name: product.name,
    denomination: product.denomination,
    price: promo.price,
    original_price: promo.promoDiscount > 0 ? basePrice : null,
    is_promo: Boolean(product.is_promo && promo.promoDiscount > 0),
    discount: promo.promoDiscount,
    is_active: product.is_active,
    is_maintenance: product.is_maintenance,
    stock: product.stock,
    sort_order: product.sort_order,
  };
}

module.exports = {
  loadSettings,
  computeBasePrice,
  computeOrderPricing,
  computeReferralDiscount,
  toPublicProduct,
  safetyFloor,
  roundIdr,
  ceilIdr,
  minMarginAmount,
};
