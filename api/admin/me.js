'use strict';
/**
 * Current admin session probe.
 *  GET /api/admin/me -> { admin }  (401 when not authenticated as admin)
 */
const { handler, ok } = require('../_lib/response');

module.exports = handler(
  async (req, res, ctx) => {
    return ok(res, { admin: ctx.admin });
  },
  { methods: ['GET'], auth: 'admin' }
);
