'use strict';
/**
 * Test a supplier connection and persist the result.
 * Also reports payment gateway configuration status (never exposes secrets).
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getSupplierAdapter } = require('../_lib/suppliers');
const { logAudit } = require('../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    const body = getBody(req);
    const supplierId = Number(body.supplier_id);
    if (!Number.isInteger(supplierId)) throw httpError(400, 'supplier_id tidak valid');

    const { rows } = await query('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
    const supplier = rows[0];
    if (!supplier) throw httpError(404, 'Supplier tidak ditemukan');

    let result;
    try {
      const adapter = getSupplierAdapter(supplier);
      result = await adapter.testConnection();
    } catch (err) {
      result = { connected: false, error: err.message };
    }

    const status = result.connected ? 'CONNECTED' : 'ERROR';
    await query(
      'UPDATE suppliers SET status = $2, last_check_at = NOW(), last_error = $3 WHERE id = $1',
      [supplierId, status, result.connected ? null : result.error || 'Tidak dapat terhubung']
    );

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'supplier.test_connection', entity: 'supplier', entityId: supplierId, details: { connected: result.connected }, ip: ctx.ip, userAgent: ctx.userAgent });

    return ok(res, { result, status });
  },
  { methods: ['POST'], auth: 'admin' }
);
