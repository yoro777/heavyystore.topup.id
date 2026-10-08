'use strict';
/**
 * Vercel Cron job:
 *  1) expire unpaid orders past their deadline
 *  2) refresh the status of orders stuck in PROCESSING (resolve supplier callbacks)
 *
 * Secured with CRON_SECRET (Vercel sends `Authorization: Bearer <CRON_SECRET>`).
 */
const { handler, ok, fail } = require('../_lib/response');
const { query } = require('../_lib/db');
const { expireOrders, refreshTopupStatus } = require('../_lib/orderService');
const { safeEqual } = require('../_lib/utils');

module.exports = handler(
  async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || !safeEqual(token, secret)) return fail(res, 401, 'Unauthorized');
    }

    const expired = await expireOrders();

    // Refresh orders in PROCESSING that were dispatched more than 3 minutes ago.
    const { rows: stale } = await query(
      `SELECT id FROM orders
        WHERE topup_status = 'PROCESSING' AND processed_at < NOW() - INTERVAL '3 minutes'
        ORDER BY processed_at ASC LIMIT 25`
    );
    let refreshed = 0;
    for (const o of stale) {
      try {
        await refreshTopupStatus(o.id);
        refreshed += 1;
      } catch (err) {
        console.warn('[cron] refresh failed for', o.id, err.message);
      }
    }

    return ok(res, { expired: expired.length, refreshed });
  },
  { methods: ['GET', 'POST'], rate: false }
);
