'use strict';
const { query } = require('./db');

async function getAllSettings() {
  const { rows } = await query('SELECT key, value, type, description, is_public FROM settings ORDER BY key');
  return rows;
}

async function getSettingsMap() {
  const { rows } = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function getSetting(key, fallback = null) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : fallback;
}

async function setSetting(key, value, type = 'string', description = null, isPublic = false) {
  const { rows } = await query(
    `INSERT INTO settings (key, value, type, description, is_public)
     VALUES ($1, $2::jsonb, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, type = EXCLUDED.type, updated_at = NOW()
     RETURNING *`,
    [key, JSON.stringify(value), type, description, isPublic]
  );
  return rows[0];
}

module.exports = { getAllSettings, getSettingsMap, getSetting, setSetting };
