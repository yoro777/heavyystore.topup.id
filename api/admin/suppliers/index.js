'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { validateOrThrow } = require('../../_lib/validate');
const { query } = require('../../_lib/db');
const { encrypt, decrypt, maskSecret } = require('../../_lib/crypto');
const { logAudit } = require('../../_lib/audit');

function safeDecrypt(v) { try { return decrypt(v); } catch (_) { return null; } }

function publicSupplier(s) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    api_url: s.api_url,
    username: s.username,
    api_key_masked: maskSecret(safeDecrypt(s.api_key)),
    secret_masked: maskSecret(safeDecrypt(s.secret)),
    has_api_key: Boolean(s.api_key),
    has_secret: Boolean(s.secret),
    is_active: s.is_active,
    status: s.status,
    last_check_at: s.last_check_at,
    last_error: s.last_error,
    created_at: s.created_at,
  };
}

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM suppliers ORDER BY name');
      return ok(res, { suppliers: rows.map(publicSupplier) });
    }

    const data = validateOrThrow(getBody(req), {
      name: { type: 'string', required: true, min: 2, max: 80 },
      code: { type: 'enum', values: ['digiflazz', 'vipreseller', 'generic'], required: true },
      api_url: { type: 'string', max: 300, nullable: true },
      api_key: { type: 'string', max: 500, nullable: true },
      username: { type: 'string', max: 120, nullable: true },
      secret: { type: 'string', max: 500, nullable: true },
      is_active: { type: 'boolean', default: true },
    });

    const dup = await query('SELECT id FROM suppliers WHERE code = $1', [data.code]);
    if (dup.rows.length) throw httpError(409, 'Supplier dengan kode ini sudah ada');

    const { rows } = await query(
      `INSERT INTO suppliers (name, code, api_url, api_key, username, secret, is_active, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DISCONNECTED') RETURNING *`,
      [data.name, data.code, data.api_url, encrypt(data.api_key), data.username, encrypt(data.secret), data.is_active]
    );
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'supplier.create', entity: 'supplier', entityId: rows[0].id, details: { code: data.code }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { supplier: publicSupplier(rows[0]) }, 201);
  },
  { methods: ['GET', 'POST'], auth: 'admin' }
);
