'use strict';
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { validateOrThrow } = require('../_lib/validate');
const { query } = require('../_lib/db');
const { hashPassword, signToken, setAuthCookie } = require('../_lib/auth');
const { generateReferralCode } = require('../_lib/utils');
const { logAudit } = require('../_lib/audit');
const { getSetting } = require('../_lib/settings');

module.exports = handler(
  async (req, res, ctx) => {
    const enabled = await getSetting('registration_enabled', true);
    if (enabled === false) throw httpError(403, 'Registrasi sedang dinonaktifkan');

    const body = getBody(req);
    const data = validateOrThrow(body, {
      username: {
        type: 'string',
        required: true,
        min: 3,
        max: 30,
        pattern: /^[a-zA-Z0-9_.]+$/,
        patternMessage: 'Username hanya boleh huruf, angka, titik, dan underscore',
      },
      email: { type: 'email', required: true, max: 120 },
      phone: { type: 'phone', required: true },
      password: { type: 'string', required: true, min: 8, max: 128 },
      referral_code: { type: 'string', max: 40, nullable: true },
    });

    const dup = await query(
      'SELECT id FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($2)',
      [data.email, data.username]
    );
    if (dup.rows.length) throw httpError(409, 'Email atau username sudah terdaftar');

    let referredBy = null;
    if (data.referral_code) {
      const { rows } = await query(
        'SELECT code FROM referrals WHERE upper(code) = upper($1) AND is_active = TRUE',
        [data.referral_code]
      );
      if (rows[0]) referredBy = rows[0].code;
    }

    const ownCode = generateReferralCode(data.username);
    const hash = await hashPassword(data.password);

    const { rows } = await query(
      `INSERT INTO users (username, email, phone, password_hash, referral_code, referred_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, username, email, phone, referral_code, status, created_at`,
      [data.username, data.email, data.phone, hash, ownCode, referredBy]
    );
    const user = rows[0];

    const token = signToken({ sub: user.id, role: 'user', username: user.username });
    setAuthCookie(res, 'user', token);

    await logAudit({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.register',
      entity: 'user',
      entityId: user.id,
      details: { referredBy },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return ok(res, { user }, 201);
  },
  { methods: ['POST'], rate: { window: 60, max: 10 } }
);
