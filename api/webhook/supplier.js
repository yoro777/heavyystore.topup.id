'use strict';
/**
 * Supplier top-up callback.
 * Suppliers (e.g. Digiflazz) do not sign callbacks, so we NEVER trust the payload
 * status directly: we use it only to identify the order, then re-query the
 * supplier for the authoritative status before applying any transition.
 */
const { handler, ok, fail, getBody } = require('../_lib/response');
const { query } = require('../_lib/db');
const { refreshTopupStatus } = require('../_lib/orderService');

async function logWebhook(fields) {
  try {
    await query(
      `INSERT INTO webhook_logs (source, event, reference, signature_valid, processed, error, payload, ip)
       VALUES ('supplier',$1,$2,$3,$4,$5,$6,$7)`,
      [
        fields.event || null,
        fields.reference || null,
        false,
        Boolean(fields.processed),
        fields.error || null,
        fields.payload ? JSON.stringify(fields.payload) : null,
        fields.ip || null,
      ]
    );
  } catch (err) {
    console.warn('[webhook:supplier] log failed:', err.message);
  }
}

function extractRef(body) {
  const d = body && (body.data || body);
  return (
    (d && (d.ref_id || d.refId || d.reference || d.partnerReferenceNo || d.trx_id)) ||
    (body && (body.ref_id || body.reference)) ||
    null
  );
}

module.exports = handler(
  async (req, res, ctx) => {
    const body = getBody(req);
    const ref = extractRef(body);
    if (!ref) {
      await logWebhook({ event: 'missing_ref', payload: body, ip: ctx.ip });
      return fail(res, 400, 'reference tidak ditemukan');
    }

    const { rows } = await query(
      'SELECT id FROM orders WHERE supplier_reference = $1 OR order_id = $1',
      [ref]
    );
    const order = rows[0];
    if (!order) {
      await logWebhook({ event: 'unknown_order', reference: ref, payload: body, ip: ctx.ip });
      return ok(res, { message: 'Order tidak ditemukan, diabaikan' });
    }

    let processed = false;
    let error = null;
    try {
      // Re-query the supplier for the real status (authoritative).
      await refreshTopupStatus(order.id);
      processed = true;
    } catch (err) {
      error = err.message;
      console.error('[webhook:supplier] refresh error:', err.message);
    }

    await logWebhook({ event: 'callback', reference: ref, processed, error, payload: body, ip: ctx.ip });
    return ok(res, { message: 'OK', processed });
  },
  { methods: ['POST'], rate: false }
);
