/* ==========================================================================
   HEAVY STORE TOP UP — Shared UI layer
   Formatting, toasts, status badges, and the site chrome (navbar / bottom
   nav / footer). Loaded on every public page after api.js.
   ========================================================================== */
(function () {
  'use strict';

  const HVY = (window.HVY = window.HVY || {});
  const api = HVY.api;

  /* ---------------------------------------------------- Loading screen (logo) */
  function initPageLoader() {
    if (document.getElementById('pageLoader')) return;
    const el = document.createElement('div');
    el.id = 'pageLoader';
    el.className = 'page-loader';
    el.innerHTML = '<img src="/assets/logo.png" alt="Memuat HEAVY STORE TOP UP">';
    document.body.appendChild(el);
    let hidden = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      el.style.transition = 'opacity .35s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    };
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide, { once: true });
    // Safety net: never trap the user if a resource stalls.
    setTimeout(hide, 6000);
  }
  if (document.body) initPageLoader();
  else document.addEventListener('DOMContentLoaded', initPageLoader, { once: true });

  /* ----------------------------------------------------------- Formatting */
  const fmt = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

  function fmtDate(value, withTime = true) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleString('id-ID', opts);
  }

  function timeAgo(value) {
    if (!value) return '-';
    const diff = Date.now() - new Date(value).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'baru saja';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' menit lalu';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' jam lalu';
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' hari lalu';
    return fmtDate(value, false);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* --------------------------------------------------------------- Toasts */
  function toastWrap() {
    let wrap = document.getElementById('toastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toastWrap';
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  const ICONS = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };

  function toast(message, type = 'info', timeout = 4200) {
    const el = document.createElement('div');
    el.className = 'hvy-toast ' + type;
    el.innerHTML =
      '<i class="bi ' + (ICONS[type] || ICONS.info) + '"></i>' +
      '<div class="flex-grow-1">' + escapeHtml(message) + '</div>' +
      '<button class="btn-close btn-close-white btn-sm" aria-label="Tutup"></button>';
    const close = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 260);
    };
    el.querySelector('.btn-close').addEventListener('click', close);
    toastWrap().appendChild(el);
    if (timeout) setTimeout(close, timeout);
    return el;
  }

  /* --------------------------------------------------------- Status badges */
  const STATUS_LABEL = {
    PENDING: 'Menunggu Pembayaran',
    PAID: 'Dibayar',
    PROCESSING: 'Diproses',
    SUCCESS: 'Berhasil',
    FAILED: 'Gagal',
    EXPIRED: 'Kedaluwarsa',
    REFUNDED: 'Dana Dikembalikan',
    CANCELLED: 'Dibatalkan',
  };

  function statusLabel(status) { return STATUS_LABEL[status] || status || '-'; }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    return '<span class="badge-status st-' + escapeHtml(s) + '">' + escapeHtml(statusLabel(status)) + '</span>';
  }

  /* ------------------------------------------------------------- Buttons */
  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.classList.add('btn-loading'); btn.disabled = true; }
    else { btn.classList.remove('btn-loading'); btn.disabled = false; }
  }

  /* ------------------------------------------------------------ Settings */
  let _settings = null;
  async function getSettings(force = false) {
    if (_settings && !force) return _settings;
    try {
      const res = await api.settings();
      _settings = res.settings || {};
    } catch (_) { _settings = {}; }
    return _settings;
  }

  /* -------------------------------------------------------------- Session */
  let _user = null;
  let _userLoaded = false;
  async function currentUser(force = false) {
    if (_userLoaded && !force) return _user;
    try {
      const res = await api.me();
      _user = res.user || null;
      HVY.userStats = res.stats || null;
    } catch (_) { _user = null; }
    _userLoaded = true;
    return _user;
  }

  async function requireAuth(redirect = '/login.html') {
    const user = await currentUser(true);
    if (!user) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = redirect + '?next=' + next;
      return null;
    }
    return user;
  }

  /* ---------------------------------------------------------- Site chrome */
  const NAV_LINKS = [
    { href: '/index.html', label: 'Home', icon: 'bi-house-door', key: 'home' },
    { href: '/topup.html', label: 'Top Up', icon: 'bi-lightning-charge', key: 'topup' },
    { href: '/check-order.html', label: 'Cek Pesanan', icon: 'bi-search', key: 'check' },
    { href: '/promo.html', label: 'Promo', icon: 'bi-tags', key: 'promo' },
    { href: '/bantuan.html', label: 'Bantuan', icon: 'bi-question-circle', key: 'help' },
  ];

  function navHtml(active, user) {
    const links = NAV_LINKS.map(
      (l) => '<li class="nav-item"><a class="nav-link nav-link-hvy ' + (active === l.key ? 'active' : '') + '" href="' + l.href + '">' + l.label + '</a></li>'
    ).join('');
    const account = user
      ? '<a class="btn btn-hvy-outline btn-sm px-3" href="/profile.html"><i class="bi bi-person-circle me-1"></i> ' + escapeHtml(user.username) + '</a>'
      : '<a class="btn btn-hvy-outline btn-sm px-3" href="/login.html">Masuk</a>' +
        '<a class="btn btn-hvy btn-sm px-3" href="/register.html">Daftar</a>';

    return (
      '<nav class="hvy-navbar navbar navbar-expand-lg">' +
        '<div class="container">' +
          '<a class="navbar-brand d-flex align-items-center gap-2" href="/index.html">' +
            '<img class="brand-logo" src="/assets/logo.png" alt="HEAVY STORE TOP UP">' +
            '<span class="d-none d-sm-flex flex-column"><span class="brand-text">HEAVY STORE</span><span class="brand-sub">TOP UP</span></span>' +
          '</a>' +
          '<button class="navbar-toggler border-0 text-white" type="button" data-bs-toggle="collapse" data-bs-target="#navMain" aria-label="Menu"><i class="bi bi-list fs-3"></i></button>' +
          '<div class="collapse navbar-collapse" id="navMain">' +
            '<ul class="navbar-nav mx-auto gap-lg-1">' + links + '</ul>' +
            '<div class="d-flex align-items-center gap-2 mt-3 mt-lg-0">' + account + '</div>' +
          '</div>' +
        '</div>' +
      '</nav>'
    );
  }

  function bottomNavHtml(active, user) {
    const items = [
      { href: '/index.html', label: 'Home', icon: 'bi-house-door', key: 'home' },
      { href: '/topup.html', label: 'Top Up', icon: 'bi-lightning-charge', key: 'topup' },
      { href: user ? '/profile.html#orders' : '/check-order.html', label: 'Pesanan', icon: 'bi-receipt', key: 'orders' },
      { href: '/promo.html', label: 'Promo', icon: 'bi-tags', key: 'promo' },
      { href: user ? '/profile.html' : '/login.html', label: 'Akun', icon: 'bi-person', key: 'account' },
    ];
    return items
      .map(
        (i) =>
          '<a href="' + i.href + '" class="' + (active === i.key ? 'active' : '') + '"><i class="bi ' + i.icon + '"></i><span>' + i.label + '</span></a>'
      )
      .join('');
  }

  function footerHtml(settings) {
    const wa = settings && settings.contact_whatsapp ? settings.contact_whatsapp : '';
    const email = (settings && settings.contact_email) || 'support@heavyystore.topup.id';
    return (
      '<footer class="hvy-footer mt-5">' +
        '<div class="container py-5">' +
          '<div class="row g-4">' +
            '<div class="col-lg-4">' +
              '<img class="footer-logo mb-3" src="/assets/logo.png" alt="HEAVY STORE TOP UP">' +
              '<p class="text-muted-2 mb-2" style="max-width:340px">Top Up Game Cepat, Aman &amp; Otomatis. Platform top up game otomatis, aman, dan terpercaya di Indonesia.</p>' +
              '<div class="d-flex gap-2">' +
                '<a href="#" class="btn btn-hvy-ghost btn-sm" aria-label="Instagram"><i class="bi bi-instagram"></i></a>' +
                '<a href="#" class="btn btn-hvy-ghost btn-sm" aria-label="TikTok"><i class="bi bi-tiktok"></i></a>' +
                '<a href="#" class="btn btn-hvy-ghost btn-sm" aria-label="WhatsApp"><i class="bi bi-whatsapp"></i></a>' +
              '</div>' +
            '</div>' +
            '<div class="col-6 col-lg-2">' +
              '<h6 class="text-white fw-bold mb-3">Menu</h6>' +
              '<div class="d-flex flex-column gap-2">' +
                '<a href="/index.html">Home</a><a href="/topup.html">Top Up</a><a href="/check-order.html">Cek Pesanan</a><a href="/promo.html">Promo</a>' +
              '</div>' +
            '</div>' +
            '<div class="col-6 col-lg-2">' +
              '<h6 class="text-white fw-bold mb-3">Bantuan</h6>' +
              '<div class="d-flex flex-column gap-2">' +
                '<a href="/bantuan.html">Bantuan / FAQ</a><a href="/terms.html">Syarat &amp; Ketentuan</a><a href="/privacy.html">Privacy Policy</a>' +
              '</div>' +
            '</div>' +
            '<div class="col-lg-4">' +
              '<h6 class="text-white fw-bold mb-3">Kontak</h6>' +
              '<div class="d-flex flex-column gap-2 text-muted-2">' +
                '<span><i class="bi bi-envelope me-2"></i>' + escapeHtml(email) + '</span>' +
                (wa ? '<span><i class="bi bi-whatsapp me-2"></i>' + escapeHtml(wa) + '</span>' : '') +
                '<span><i class="bi bi-shield-check me-2"></i>Pembayaran &amp; top up otomatis 24 jam</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="divider-silver my-4"></div>' +
          '<div class="d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">' +
            '<small class="text-muted-2">© 2026 HEAVY STORE TOP UP — All Rights Reserved.</small>' +
            '<small class="text-muted-2">Dibuat dengan <i class="bi bi-heart-fill text-danger"></i> di Indonesia</small>' +
          '</div>' +
        '</div>' +
      '</footer>'
    );
  }

  async function mountChrome(active) {
    const [settings, user] = await Promise.all([getSettings(), currentUser()]);

    const navEl = document.getElementById('site-nav');
    if (navEl) navEl.innerHTML = navHtml(active, user);

    const bottomEl = document.getElementById('bottom-nav');
    if (bottomEl) {
      bottomEl.className = 'bottom-nav';
      bottomEl.innerHTML = bottomNavHtml(active, user);
    }

    const footerEl = document.getElementById('site-footer');
    if (footerEl) footerEl.innerHTML = footerHtml(settings);

    // Maintenance banner
    if (settings.maintenance_mode === true) {
      const b = document.createElement('div');
      b.className = 'alert alert-warning text-center mb-0 rounded-0';
      b.innerHTML = '<i class="bi bi-cone-striped me-2"></i>' + escapeHtml(settings.maintenance_message || 'Layanan sedang dalam pemeliharaan.');
      document.body.insertBefore(b, document.body.firstChild);
    }

    // Announcement
    if (settings.announcement) {
      const a = document.createElement('div');
      a.className = 'container mt-3';
      a.innerHTML = '<div class="hvy-card p-3 d-flex align-items-center gap-2"><i class="bi bi-megaphone-fill"></i><span>' + escapeHtml(settings.announcement) + '</span></div>';
      const main = document.querySelector('main') || document.body;
      main.insertBefore(a, main.firstChild);
    }

    // Unread notification dot
    if (user) {
      api.notifications(1).then((r) => {
        if (r.unread > 0) {
          const link = document.querySelector('.bottom-nav a[href="/profile.html"]');
          if (link) link.insertAdjacentHTML('beforeend', '<span class="badge bg-danger rounded-pill ms-1" style="font-size:.55rem">' + r.unread + '</span>');
        }
      }).catch(() => {});
    }
    return { settings, user };
  }

  /* --------------------------------------------------------- Query params */
  function param(name) { return new URLSearchParams(location.search).get(name); }

  function debounce(fn, ms = 350) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  Object.assign(HVY, {
    fmt, fmtDate, timeAgo, escapeHtml, qs, qsa, toast, statusLabel, statusBadge,
    setLoading, getSettings, currentUser, requireAuth, mountChrome, param, debounce,
    copy(text) {
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Disalin ke clipboard', 'success'));
      else toast('Salin manual: ' + text, 'info');
    },
  });
})();
