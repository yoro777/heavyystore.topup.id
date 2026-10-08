'use strict';
const { handler, ok } = require('../_lib/response');
const { clearAuthCookie } = require('../_lib/auth');

module.exports = handler(
  async (req, res) => {
    clearAuthCookie(res, 'user');
    clearAuthCookie(res, 'admin');
    return ok(res, { message: 'Logout berhasil' });
  },
  { methods: ['POST'], auth: 'optional' }
);
