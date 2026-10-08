'use strict';
const { query } = require('./db');

/**
 * Write an audit log entry. Never throws (logging must not break the request).
 */
async function logAudit({
  actorType = 'system',
  actorId = null,
  action,
  entity = null,
  entityId = null,
  details = null,
  ip = null,
  userAgent = null,
} = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, action, entity, entity_id, details, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        actorType,
        actorId,
        action,
        entity,
        entityId != null ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        ip,
        userAgent ? String(userAgent).slice(0, 400) : null,
      ]
    );
  } catch (err) {
    console.warn('[audit] failed:', err.message);
  }
}

module.exports = { logAudit };
