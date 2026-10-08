'use strict';
const { handler, ok, getBody, httpError } = require('../../_lib/response');
const { query } = require('../../_lib/db');
const { slugify } = require('../../_lib/utils');
const { logAudit } = require('../../_lib/audit');

const FIELDS = ['name', 'slug', 'category', 'publisher', 'logo_url', 'banner_url', 'description', 'requires_server_id', 'server_id_label', 'is_active', 'is_maintenance', 'sort_order'];

module.exports = handler(
  async (req, res, ctx) => {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) throw httpError(400, 'ID tidak valid');

    if (req.method === 'DELETE') {
      const { rows } = await query('DELETE FROM games WHERE id = $1 RETURNING id', [id]);
      if (!rows[0]) throw httpError(404, 'Game tidak ditemukan');
      await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'game.delete', entity: 'game', entityId: id, ip: ctx.ip, userAgent: ctx.userAgent });
      return ok(res, { message: 'Game dihapus' });
    }

    const body = getBody(req);
    const sets = [];
    const params = [];
    let i = 1;
    for (const f of FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        let v = body[f];
        if (f === 'slug') v = slugify(v);
        sets.push(`${f} = $${i++}`);
        params.push(v);
      }
    }
    if (!sets.length) throw httpError(400, 'Tidak ada perubahan');
    params.push(id);
    const { rows } = await query(`UPDATE games SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    if (!rows[0]) throw httpError(404, 'Game tidak ditemukan');

    await logAudit({ actorType: 'admin', actorId: ctx.admin.id, action: 'game.update', entity: 'game', entityId: id, details: body, ip: ctx.ip, userAgent: ctx.userAgent });
    return ok(res, { game: rows[0] });
  },
  { methods: ['PUT', 'PATCH', 'DELETE'], auth: 'admin' }
);
