'use strict';
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');
const { getAllSettings } = require('../_lib/settings');
const { logAudit } = require('../_lib/audit');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const settings = await getAllSettings();
      return ok(res, { settings });
    }

    const body = getBody(req);
    const incoming = body.settings;
    if (!incoming || typeof incoming !== 'object') throw httpError(400, 'Payload settings tidak valid');

    const updated = [];
    for (const [key, value] of Object.entries(incoming)) {
      const { rows } = await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING key, value`,
        [key, JSON.stringify(value)]
      );
      updated.push(rows[0]);
    }

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'settings.update', entity: 'settings', details: { keys: Object.keys(incoming) }, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { updated });
  },
  { methods: ['GET', 'PUT'], auth: 'admin' }
);
