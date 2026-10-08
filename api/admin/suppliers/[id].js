'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { encrypt, decrypt, maskSecret } = require('../../_lib/crypto');
const { logAudit } = require('../../_lib/audit');

function safeDecrypt(v) { try { return decrypt(v); } catch (_) { return null; } }
function publicSupplier(s) {
  return {
    id: s.id, name: s.name, code: s.code, api_url: s.api_url, username: s.username,
    api_key_masked: maskSecret(safeDecrypt(s.api_key)),
    secret_masked: maskSecret(safeDecrypt(s.secret)),
    has_api_key: Boolean(s.api_key), has_secret: Boolean(s.secret),
    is_active: s.is_active, status: s.status, last_check_at: s.last_check_at, last_error: s.last_error,
  };
}

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'DELETE') {
      const { rows } = await query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [id]);
      if (!rows[0]) throw httpError(404, 'Supplier tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'supplier.delete', entity: 'supplier', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Supplier dihapus' });
    }

    const body = getBody(req);
    const sets = [];
    const params = [];
    let i = 1;
    const simple = ['name', 'code', 'api_url', 'username', 'is_active'];
    for (const f of simple) {
      if (Object.prototype.hasOwnProperty.call(body, f)) { sets.push(`${f} = $${i++}`); params.push(body[f]); }
    }
    // Secrets: only update when a non-empty value is provided (never blank them accidentally)
    if (body.api_key) { sets.push(`api_key = $${i++}`); params.push(encrypt(body.api_key)); }
    if (body.secret) { sets.push(`secret = $${i++}`); params.push(encrypt(body.secret)); }

    if (!sets.length) throw httpError(400, 'Tidak ada perubahan');
    params.push(id);
    const { rows } = await query(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows[0]) throw httpError(404, 'Supplier tidak ditemukan');
    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'supplier.update', entity: 'supplier', entityId: id, details: Object.keys(body), ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { supplier: publicSupplier(rows[0]) });
  },
  { methods: ['PUT', 'PATCH', 'DELETE'], auth: 'admin' }
);
