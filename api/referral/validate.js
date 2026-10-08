'use strict';
const { handler, ok, getBody } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { computeReferralDiscount } = require('../_lib/pricing');
const { getSetting } = require('../_lib/settings');

module.exports = handler(
  async (req, res) => {
    const enabled = await getSetting('referral_enabled', true);
    if (enabled === false) return ok(res, { valid: false, discount: 0, message: 'Sistem referral sedang nonaktif' });

    const body = getBody(req);
    const data = validateOrThrow(body, {
      code: { type: 'string', required: true, max: 40 },
      amount: { type: 'number', required: true, min: 0 },
    });

    const { rows } = await query('SELECT * FROM referrals WHERE upper(code) = upper($1)', [data.code]);
    const referral = rows[0];
    if (!referral || !referral.is_active) {
      return ok(res, { valid: false, discount: 0, message: 'Kode referral tidak valid' });
    }

    const now = Date.now();
    if (referral.start_date && now < new Date(referral.start_date).getTime()) {
      return ok(res, { valid: false, discount: 0, message: 'Kode referral belum berlaku' });
    }
    if (referral.end_date && now > new Date(referral.end_date).getTime()) {
      return ok(res, { valid: false, discount: 0, message: 'Kode referral sudah kedaluwarsa' });
    }
    if (Number(referral.usage_limit) > 0 && Number(referral.used_count) >= Number(referral.usage_limit)) {
      return ok(res, { valid: false, discount: 0, message: 'Kuota kode referral sudah habis' });
    }
    if (data.amount < Number(referral.min_transaction || 0)) {
      return ok(res, {
        valid: false,
        discount: 0,
        message: `Minimal transaksi Rp${Number(referral.min_transaction).toLocaleString('id-ID')} untuk kode ini`,
      });
    }

    // Preview discount (final value is recomputed server-side at order creation).
    const discount = computeReferralDiscount(referral, data.amount, 0);
    return ok(res, {
      valid: discount > 0,
      code: referral.code,
      discount,
      description: referral.description,
      message: discount > 0 ? 'Kode referral berhasil diterapkan' : 'Kode referral tidak dapat digunakan untuk transaksi ini',
    });
  },
  { methods: ['POST'], rate: { window: 60, max: 40 } }
);
