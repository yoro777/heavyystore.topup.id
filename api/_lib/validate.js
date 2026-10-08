'use strict';
/**
 * Tiny dependency-free input validator.
 * Usage:
 *   const { valid, errors, value } = validate(body, {
 *     email: { type: 'email', required: true },
 *     password: { type: 'string', required: true, min: 8, max: 128 },
 *     role: { type: 'enum', values: ['admin','operator'], default: 'admin' },
 *   });
 */
const { httpError } = require('./response');

function coerce(rule, raw) {
  const t = rule.type || 'string';
  switch (t) {
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : NaN;
    }
    case 'integer': {
      if (raw === '' || raw === null || raw === undefined) return undefined;
      const n = Number(raw);
      return Number.isInteger(n) ? n : NaN;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === '1' || raw === 1) return true;
      if (raw === 'false' || raw === '0' || raw === 0) return false;
      return undefined;
    }
    case 'string':
    case 'email':
    case 'phone':
    case 'enum':
    default:
      if (raw === null || raw === undefined) return undefined;
      return typeof raw === 'string' ? raw.trim() : String(raw).trim();
  }
}

function validate(data, rules) {
  const errors = {};
  const value = {};
  const src = data && typeof data === 'object' ? data : {};

  for (const [field, rule] of Object.entries(rules)) {
    let v = coerce(rule, src[field]);

    const isEmpty = v === undefined || v === null || v === '';
    if (isEmpty) {
      if (rule.required) {
        errors[field] = `${field} wajib diisi`;
        continue;
      }
      if (rule.default !== undefined) {
        value[field] = rule.default;
      } else {
        value[field] = rule.nullable ? null : undefined;
      }
      continue;
    }

    if (rule.type === 'number' || rule.type === 'integer') {
      if (Number.isNaN(v)) { errors[field] = `${field} harus berupa angka`; continue; }
      if (rule.min !== undefined && v < rule.min) { errors[field] = `${field} minimal ${rule.min}`; continue; }
      if (rule.max !== undefined && v > rule.max) { errors[field] = `${field} maksimal ${rule.max}`; continue; }
    } else if (rule.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { errors[field] = 'Format email tidak valid'; continue; }
    } else if (rule.type === 'phone') {
      const digits = v.replace(/[^\d+]/g, '');
      if (!/^(\+?62|0)8\d{7,13}$/.test(digits)) { errors[field] = 'Format nomor HP tidak valid'; continue; }
      v = digits;
    } else if (rule.type === 'enum') {
      if (!rule.values.includes(v)) { errors[field] = `${field} tidak valid`; continue; }
    } else {
      if (rule.min !== undefined && v.length < rule.min) { errors[field] = `${field} minimal ${rule.min} karakter`; continue; }
      if (rule.max !== undefined && v.length > rule.max) { errors[field] = `${field} maksimal ${rule.max} karakter`; continue; }
      if (rule.pattern && !rule.pattern.test(v)) { errors[field] = rule.patternMessage || `${field} tidak valid`; continue; }
    }

    if (rule.sanitize === 'stripTags') v = v.replace(/<[^>]*>/g, '');
    value[field] = v;
  }

  return { valid: Object.keys(errors).length === 0, errors, value };
}

/** Validate or throw a 422 with field errors. */
function validateOrThrow(data, rules) {
  const result = validate(data, rules);
  if (!result.valid) {
    const err = httpError(422, 'Data tidak valid');
    err.fields = result.errors;
    throw err;
  }
  return result.value;
}

module.exports = { validate, validateOrThrow };
