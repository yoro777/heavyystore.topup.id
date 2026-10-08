/* ==========================================================================
   HEAVY STORE TOP UP — Top Up flow
   The browser sends ONLY identifiers (game, product, user id, method, code).
   Every price, discount and fee is computed and enforced on the server.
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;

  const state = {
    games: [],
    game: null,
    products: [],
    methods: [],
    product: null,
    method: null,
    referral: null,
    referralDiscount: 0,
    user: null,
    idempotencyKey: null,
  };

  const el = (id) => document.getElementById(id);

  /* --------------------------------------------------------------- Games */
  async function loadGames() {
    const grid = el('gameGrid');
    try {
      const res = await api.games();
      state.games = res.games || [];
      grid.innerHTML = state.games.map((g) => (
        '<div class="col-6 col-md-4 col-lg-3">' +
          '<button type="button" class="game-card hvy-card hvy-card-lift w-100 text-start" data-slug="' + HVY.escapeHtml(g.slug) + '">' +
            '<div class="thumb"><img src="' + HVY.escapeHtml(g.logo_url || '/assets/logo.png') + '" alt="' + HVY.escapeHtml(g.name) + '" loading="lazy"></div>' +
            '<div class="name">' + HVY.escapeHtml(g.name) + '</div>' +
            '<div class="min">' + (g.min_price ? 'Mulai ' + HVY.fmt(g.min_price) : 'Segera hadir') + '</div>' +
          '</button>' +
        '</div>'
      )).join('');
    } catch (err) {
      grid.innerHTML = '<div class="col-12"><div class="empty-state"><i class="bi bi-wifi-off"></i><p class="mt-2 mb-0">' + HVY.escapeHtml(err.message) + '</p></div></div>';
    }
  }

  /* --------------------------------------------------------------- Game */
  async function selectGame(slug) {
    const game = state.games.find((g) => g.slug === slug);
    if (!game) return;
    if (game.is_maintenance) { HVY.toast('Game sedang dalam perawatan', 'warning'); return; }

    el('stepGame').classList.add('d-none');
    el('stepForm').classList.remove('d-none');
    el('gameTitle').textContent = game.name;
    el('gameLogo').src = game.logo_url || '/assets/logo.png';
    el('serverIdWrap').classList.toggle('d-none', !game.requires_server_id);
    el('serverIdLabel').textContent = game.server_id_label || 'Server ID';
    el('userIdLabel').textContent = game.requires_server_id ? 'User ID' : (game.server_id_label || 'User ID');
    el('nicknameBox').classList.add('d-none');
    el('nicknameBox').textContent = '';
    state.game = game;
    state.product = null;
    state.referral = null;
    state.referralDiscount = 0;
    el('referralMsg').textContent = '';

    await loadProducts(game.id);
    updateSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------ Products */
  async function loadProducts(gameId) {
    const box = el('nominalGrid');
    box.innerHTML = '<div class="skeleton" style="height:70px;border-radius:12px"></div><div class="skeleton" style="height:70px;border-radius:12px"></div><div class="skeleton" style="height:70px;border-radius:12px"></div><div class="skeleton" style="height:70px;border-radius:12px"></div>';
    try {
      const res = await api.game(gameId);
      state.products = (res.products || []).filter((p) => !p.is_maintenance);
      if (!state.products.length) {
        box.innerHTML = '<div class="empty-state"><i class="bi bi-box-seam"></i><p class="mt-2 mb-0">Belum ada nominal untuk game ini.</p></div>';
        return;
      }
      box.innerHTML = state.products.map((p) => (
        '<button type="button" class="nominal-item text-start" data-id="' + p.id + '">' +
          (p.is_promo ? '<span class="n-tag">PROMO</span>' : '') +
          '<div class="n-name">' + HVY.escapeHtml(p.name) + '</div>' +
          (p.original_price ? '<div class="n-old">' + HVY.fmt(p.original_price) + '</div>' : '') +
          '<div class="n-price">' + HVY.fmt(p.price) + '</div>' +
        '</button>'
      )).join('');
    } catch (err) {
      box.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p class="mt-2 mb-0">' + HVY.escapeHtml(err.message) + '</p></div>';
    }
  }

  function selectProduct(id) {
    state.product = state.products.find((p) => String(p.id) === String(id)) || null;
    HVY.qsa('#nominalGrid .nominal-item').forEach((b) => b.classList.toggle('active', String(b.dataset.id) === String(id)));
    state.referralDiscount = 0;
    el('referralMsg').textContent = '';
    if (state.referral) applyReferral(state.referral, true);
    updateSummary();
  }

  /* ------------------------------------------------------- Payment methods */
  async function loadMethods() {
    const box = el('methodList');
    try {
      const res = await api.paymentMethods();
      state.methods = res.methods || [];
      if (!state.methods.length) {
        box.innerHTML = '<div class="empty-state"><i class="bi bi-credit-card"></i><p class="mt-2 mb-0">Metode pembayaran belum tersedia.</p></div>';
        return;
      }
      box.innerHTML = state.methods.map((m) => (
        '<button type="button" class="pay-item w-100 text-start" data-code="' + HVY.escapeHtml(m.code) + '">' +
          '<img src="' + HVY.escapeHtml(m.logo_url || '/assets/logo.png') + '" alt="' + HVY.escapeHtml(m.name) + '">' +
          '<div class="flex-grow-1"><div class="fw-semibold" style="font-size:.88rem">' + HVY.escapeHtml(m.name) + '</div>' +
          '<div class="text-muted-2" style="font-size:.72rem">' + feeLabel(m) + '</div></div>' +
          '<i class="bi bi-check-circle-fill text-success d-none check"></i>' +
        '</button>'
      )).join('');
    } catch (err) {
      box.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p class="mt-2 mb-0">' + HVY.escapeHtml(err.message) + '</p></div>';
    }
  }

  function feeLabel(m) {
    const flat = Number(m.fee_flat || 0);
    const pct = Number(m.fee_percent || 0);
    if (!flat && !pct) return 'Tanpa biaya admin';
    const parts = [];
    if (flat) parts.push(HVY.fmt(flat));
    if (pct) parts.push(pct + '%');
    return 'Biaya admin: ' + parts.join(' + ');
  }

  function selectMethod(code) {
    state.method = state.methods.find((m) => m.code === code) || null;
    HVY.qsa('#methodList .pay-item').forEach((b) => {
      const active = b.dataset.code === code;
      b.classList.toggle('active', active);
      const c = b.querySelector('.check');
      if (c) c.classList.toggle('d-none', !active);
    });
    updateSummary();
  }

  /* ------------------------------------------------------------- Referral */
  async function applyReferral(code, silent = false) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { state.referral = null; state.referralDiscount = 0; updateSummary(); return; }
    if (!state.product) { if (!silent) HVY.toast('Pilih nominal terlebih dahulu', 'warning'); return; }
    try {
      const res = await api.validateReferral(code, state.product.price);
      if (res.valid) {
        state.referral = code;
        state.referralDiscount = Number(res.discount || 0);
        el('referralMsg').innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>' + HVY.escapeHtml(res.message || 'Kode diterapkan') + '</span>';
      } else {
        state.referral = null;
        state.referralDiscount = 0;
        el('referralMsg').innerHTML = '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>' + HVY.escapeHtml(res.message || 'Kode tidak valid') + '</span>';
      }
    } catch (err) {
      state.referral = null; state.referralDiscount = 0;
      el('referralMsg').innerHTML = '<span class="text-danger">' + HVY.escapeHtml(err.message) + '</span>';
    }
    updateSummary();
  }

  /* -------------------------------------------------------------- Summary */
  function computeFee() {
    if (!state.method || !state.product) return 0;
    const flat = Number(state.method.fee_flat || 0);
    const pct = Number(state.method.fee_percent || 0);
    return Math.round(flat + (state.product.price * pct) / 100);
  }

  function updateSummary() {
    const price = state.product ? state.product.price : 0;
    const fee = computeFee();
    const disc = state.referralDiscount || 0;
    const total = Math.max(0, price - disc) + fee;
    el('sumProduct').textContent = state.product ? state.product.name : '-';
    el('sumPrice').textContent = HVY.fmt(price);
    el('sumDiscountRow').classList.toggle('d-none', disc <= 0);
    el('sumDiscount').textContent = '-' + HVY.fmt(disc);
    el('sumFee').textContent = HVY.fmt(fee);
    el('sumTotal').textContent = HVY.fmt(total);
    el('sumMethod').textContent = state.method ? state.method.name : '-';
    const ready = state.game && state.product && state.method && el('userId').value.trim();
    el('btnSubmit').disabled = !ready;
  }

  /* ---------------------------------------------------------- Validate ID */
  async function validateId() {
    const btn = el('btnValidate');
    const userId = el('userId').value.trim();
    if (!state.game || !userId) { HVY.toast('Masukkan User ID terlebih dahulu', 'warning'); return; }
    HVY.setLoading(btn, true);
    try {
      const res = await api.validateSupplier({ game_id: state.game.id, user_id: userId, server_id: el('serverId').value.trim() || undefined });
      const v = res.validation || {};
      const box = el('nicknameBox');
      box.classList.remove('d-none');
      if (v.supported === false) {
        box.className = 'alert alert-info py-2 small';
        box.innerHTML = '<i class="bi bi-info-circle me-1"></i>Supplier tidak mendukung pengecekan otomatis. Pastikan User ID sudah benar.';
      } else if (v.valid) {
        box.className = 'alert alert-success py-2 small';
        box.innerHTML = '<i class="bi bi-check-circle me-1"></i>Akun ditemukan: <strong>' + HVY.escapeHtml(v.nickname || v.name || 'Terverifikasi') + '</strong>';
      } else {
        box.className = 'alert alert-danger py-2 small';
        box.innerHTML = '<i class="bi bi-x-circle me-1"></i>' + HVY.escapeHtml(v.message || 'User ID tidak ditemukan');
      }
    } catch (err) {
      HVY.toast(err.message, 'error');
    } finally {
      HVY.setLoading(btn, false);
    }
  }

  /* ------------------------------------------------------------- Submit */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; const v = c === 'x' ? r : (r & 0x3) | 0x8; return v.toString(16);
    });
  }

  async function submit() {
    const btn = el('btnSubmit');
    const userId = el('userId').value.trim();
    if (!state.game || !state.product || !state.method || !userId) {
      HVY.toast('Lengkapi data terlebih dahulu', 'warning'); return;
    }
    if (state.game.requires_server_id && !el('serverId').value.trim()) {
      HVY.toast((state.game.server_id_label || 'Server ID') + ' wajib diisi', 'warning'); return;
    }
    if (!state.idempotencyKey) state.idempotencyKey = uuid();

    const payload = {
      game_id: state.game.id,
      product_id: state.product.id,
      user_id: userId,
      server_id: el('serverId').value.trim() || undefined,
      payment_method: state.method.code,
      referral_code: state.referral || undefined,
      idempotency_key: state.idempotencyKey,
      email: el('contactEmail').value.trim() || undefined,
      phone: el('contactPhone').value.trim() || undefined,
    };

    HVY.setLoading(btn, true);
    try {
      const res = await api.createOrder(payload);
      const order = res.order;
      HVY.toast('Pesanan berhasil dibuat!', 'success');
      setTimeout(() => { location.href = '/order.html?order=' + encodeURIComponent(order.order_id); }, 500);
    } catch (err) {
      HVY.toast(err.message, 'error');
      HVY.setLoading(btn, false);
      // A new attempt (e.g. after fixing data) should use a fresh key.
      if (err.status && err.status >= 400 && err.status < 500) state.idempotencyKey = null;
    }
  }

  /* --------------------------------------------------------------- Init */
  async function init() {
    state.user = await HVY.currentUser();
    if (state.user) {
      if (state.user.email) el('contactEmail').value = state.user.email;
      if (state.user.phone) el('contactPhone').value = state.user.phone;
    }

    await Promise.all([loadGames(), loadMethods()]);

    el('gameGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slug]'); if (b) selectGame(b.dataset.slug);
    });
    el('nominalGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.nominal-item'); if (b) selectProduct(b.dataset.id);
    });
    el('methodList').addEventListener('click', (e) => {
      const b = e.target.closest('.pay-item'); if (b) selectMethod(b.dataset.code);
    });
    el('btnChangeGame').addEventListener('click', () => {
      el('stepForm').classList.add('d-none');
      el('stepGame').classList.remove('d-none');
      state.game = null; state.product = null; state.method = null; state.referral = null; state.referralDiscount = 0;
      updateSummary();
    });
    el('btnValidate').addEventListener('click', validateId);
    el('btnApplyReferral').addEventListener('click', () => applyReferral(el('referralCode').value));
    el('referralCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyReferral(el('referralCode').value); } });
    el('userId').addEventListener('input', HVY.debounce(updateSummary, 150));
    el('serverId').addEventListener('input', HVY.debounce(updateSummary, 150));
    el('btnSubmit').addEventListener('click', submit);

    const slug = HVY.param('game');
    if (slug) selectGame(slug);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
