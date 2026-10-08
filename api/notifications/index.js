'use strict';
/**
 * Customer notifications (in-app).
 *  GET  /api/notifications            -> list the current user's notifications
 *  POST /api/notifications { action } -> mark one / all as read
 */
const { handler, ok, getBody, httpError } = require('../_lib/response');
const { query } = require('../_lib/db');

module.exports = handler(
  async (req, res, ctx) => {
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query.limit || 30), 100);
      const { rows } = await query(
        `SELECT id, order_id, type, title, message, channel, is_read, created_at
           FROM notifications
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [ctx.user.id, limit]
      );
      const { rows: unread } = await query(
        'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [ctx.user.id]
      );
      return ok(res, { notifications: rows, unread: unread[0].c });
    }

    // POST: mark as read
    const body = getBody(req);
    const action = String(body.action || 'read_all');
    if (action === 'read_all') {
      await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [ctx.user.id]);
      return ok(res, { message: 'Semua notifikasi ditandai sudah dibaca' });
    }
    if (action === 'read') {
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw httpError(400, 'id tidak valid');
      await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [id, ctx.user.id]);
      return ok(res, { message: 'Notifikasi ditandai sudah dibaca' });
    }
    throw httpError(400, 'Aksi tidak dikenal');
  },
  { methods: ['GET', 'POST'], auth: 'user', rate: { window: 60, max: 90 } }
);
