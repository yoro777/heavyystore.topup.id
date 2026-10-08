/* ==========================================================================
   HEAVY STORE TOP UP — API client
   Thin fetch wrapper. Always sends cookies (HttpOnly session), never stores
   secrets, and NEVER sends prices — the server is the single source of truth.
   ========================================================================== */
(function () {
  'use strict';

  const BASE = '/api';

  function buildUrl(path, query) {
    let url = path.startsWith('/') ? path : '/' + path;
    url = BASE + url;
    if (query && typeof query === 'object') {
      const qs = new URLSearchParams();
      Object.keys(query).forEach((k) => {
        const v = query[k];
        if (v !== undefined && v !== null && v !== '') qs.append(k, v);
      });
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    return url;
  }

  async function request(path, { method = 'GET', body, query, headers } = {}) {
    const opts = {
      method,
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, headers || {}),
    };
    if (body !== undefined && body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(buildUrl(path, query), opts);
    } catch (err) {
      const e = new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
      e.network = true;
      throw e;
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
    }

    if (!res.ok || (data && data.success === false)) {
      const message = (data && (data.error || data.message)) || `Permintaan gagal (${res.status})`;
      const e = new Error(message);
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data || {};
  }

  const api = {
    request,
    get: (path, query) => request(path, { method: 'GET', query }),
    post: (path, body, query) => request(path, { method: 'POST', body, query }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    del: (path) => request(path, { method: 'DELETE' }),

    // ---- typed helpers ----
    settings: () => request('/settings/public'),
    games: () => request('/games'),
    game: (id) => request('/games/' + encodeURIComponent(id)),
    products: (gameId) => request('/products', { query: { game_id: gameId } }),
    paymentMethods: () => request('/payment/methods'),
    promo: () => request('/promo'),
    validateReferral: (code, amount) => request('/referral/validate', { method: 'POST', body: { code, amount } }),
    validateSupplier: (payload) => request('/supplier/validate', { method: 'POST', body: payload }),
    createOrder: (payload) => request('/orders/create', { method: 'POST', body: payload }),
    myOrders: (limit = 20, offset = 0) => request('/orders', { query: { limit, offset } }),
    order: (orderId) => request('/orders/' + encodeURIComponent(orderId)),
    checkOrder: (orderId) => request('/orders/check', { method: 'POST', body: { order_id: orderId } }),
    paymentStatus: (orderId) => request('/payment/status', { query: { order_id: orderId } }),
    me: () => request('/auth/me'),
    login: (identifier, password) => request('/auth/login', { method: 'POST', body: { identifier, password } }),
    register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    notifications: (limit = 30) => request('/notifications', { query: { limit } }),
    markNotificationsRead: (action, id) => request('/notifications', { method: 'POST', body: { action, id } }),
    admin: {
      login: (identifier, password) => request('/auth/admin-login', { method: 'POST', body: { identifier, password } }),
      bootstrap: (payload) => request('/auth/admin-bootstrap', { method: 'POST', body: payload }),
      me: () => request('/admin/me'),
      dashboard: () => request('/admin/dashboard'),
      transactions: (query) => request('/admin/transactions', { query }),
      games: () => request('/admin/games'),
      createGame: (b) => request('/admin/games', { method: 'POST', body: b }),
      updateGame: (id, b) => request('/admin/games/' + id, { method: 'PUT', body: b }),
      deleteGame: (id) => request('/admin/games/' + id, { method: 'DELETE' }),
      products: (query) => request('/admin/products', { query }),
      createProduct: (b) => request('/admin/products', { method: 'POST', body: b }),
      updateProduct: (id, b) => request('/admin/products/' + id, { method: 'PUT', body: b }),
      deleteProduct: (id) => request('/admin/products/' + id, { method: 'DELETE' }),
      customers: (query) => request('/admin/customers', { query }),
      customer: (id) => request('/admin/customers/' + id),
      customerAction: (id, b) => request('/admin/customers/' + id, { method: 'PUT', body: b }),
      referrals: () => request('/admin/referrals'),
      createReferral: (b) => request('/admin/referrals', { method: 'POST', body: b }),
      updateReferral: (id, b) => request('/admin/referrals/' + id, { method: 'PUT', body: b }),
      deleteReferral: (id) => request('/admin/referrals/' + id, { method: 'DELETE' }),
      paymentMethods: () => request('/admin/payment-methods'),
      createPaymentMethod: (b) => request('/admin/payment-methods', { method: 'POST', body: b }),
      updatePaymentMethod: (id, b) => request('/admin/payment-methods/' + id, { method: 'PUT', body: b }),
      deletePaymentMethod: (id) => request('/admin/payment-methods/' + id, { method: 'DELETE' }),
      suppliers: () => request('/admin/suppliers'),
      createSupplier: (b) => request('/admin/suppliers', { method: 'POST', body: b }),
      updateSupplier: (id, b) => request('/admin/suppliers/' + id, { method: 'PUT', body: b }),
      deleteSupplier: (id) => request('/admin/suppliers/' + id, { method: 'DELETE' }),
      testConnection: (supplierId) => request('/admin/test-connection', { method: 'POST', body: { supplier_id: supplierId } }),
      settings: () => request('/admin/settings'),
      saveSettings: (settings) => request('/admin/settings', { method: 'PUT', body: { settings } }),
      notifications: (query) => request('/admin/notifications', { query }),
      auditLogs: (query) => request('/admin/audit-logs', { query }),
    },
  };

  window.HVY = window.HVY || {};
  window.HVY.api = api;
})();
