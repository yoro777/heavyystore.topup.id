/* ==========================================================================
   HEAVY STORE TOP UP — Admin shared shell & utilities
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;
  const admin = api.admin;
  const el = (id) => document.getElementById(id);

  /* --------------------------------------------------------------- Nav map */
  const ADMIN_NAV = [
    { key: 'dashboard',   href: '/admin/dashboard.html',      label: 'Dashboard',        icon: 'bi-speedometer2' },
    { key: 'transactions',href: '/admin/transactions.html',   label: 'Transaksi',        icon: 'bi-receipt' },
    { key: 'games',       href: '/admin/games.html',          label: 'Game',             icon: 'bi-controller' },
    { key: 'products',    href: '/admin/products.html',       label: 'Produk',           icon: 'bi-box-seam' },
    { key: 'customers',   href: '/admin/customers.html',      label: 'Customer',         icon: 'bi-people' },
    { key: 'referrals',   href: '/admin/referrals.html',      label: 'Referral',         icon: 'bi-gift' },
    { key: 'payment',     href: '/admin/payment-gateway.html',label: 'Payment Gateway',  icon: 'bi-credit-card' },
    { key: 'suppliers',   href: '/admin/suppliers.html',      label: 'Supplier',         icon: 'bi-hdd-network' },
    { key: 'notifications',href: '/admin/notifications.html', label: 'Notifikasi',       icon: 'bi-bell' },
    { key: 'settings',    href: '/admin/settings.html',       label: 'Pengaturan',       icon: 'bi-gear' },
    { key: 'audit',       href: '/admin/audit-logs.html',     label: 'Audit Log',        icon: 'bi-clipboard-check' },
  ];

  let _admin = null;

  function sidebarHtml(active) {
    const links = ADMIN_NAV.map((n) =>
      '<a href="' + n.href + '" class="' + (active === n.key ? 'active' : '') + '">' +
        '<i class="bi ' + n.icon + '"></i><span>' + n.label + '</span>' +
      '</a>'
    ).join('');
    return '' +
      '<div class="side-brand">' +
        '<img src="/assets/logo.png" alt="HEAVY">' +
        '<div><div class="t">HEAVY STORE</div><div class="s">ADMIN PANEL</div></div>' +
      '</div>' +
      '<nav class="admin-nav">' +
        '<div class="nav-section">Utama</div>' + links.slice(0, 0) +
        links +
        '<div class="nav-section">Sesi</div>' +
        '<a href="/" target="_blank"><i class="bi bi-box-arrow-up-right"></i><span>Lihat Situs</span></a>' +
        '<a href="#" id="navLogout"><i class="bi bi-box-arrow-right"></i><span>Keluar</span></a>' +
      '</nav>';
  }

  function topbarHtml(active) {
    const cur = ADMIN_NAV.find((n) => n.key === active) || { label: 'Admin' };
    const name = _admin ? _admin.username : 'Admin';
    return '' +
      '<button class="btn btn-hvy-ghost btn-sm d-lg-none me-2" id="btnSidebar"><i class="bi bi-list"></i></button>' +
      '<div class="flex-grow-1 min-w-0">' +
        '<div class="page-title text-truncate">' + cur.label + '</div>' +
        '<div class="page-sub">HEAVY STORE TOP UP — Control Center</div>' +
      '</div>' +
      '<div class="d-flex align-items-center gap-2">' +
        '<span class="pill d-none d-sm-inline-flex"><i class="bi bi-shield-check me-1"></i>' + HVY.escapeHtml(name) + '</span>' +
        '<button class="btn btn-hvy-ghost btn-sm" id="btnRefreshTop"><i class="bi bi-arrow-clockwise"></i></button>' +
      '</div>';
  }

  /* ------------------------------------------------------------- Auth gate */
  async function requireAdmin() {
    try {
      const res = await admin.me();
      _admin = res.admin;
      return _admin;
    } catch (_) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '/admin/index.html?next=' + next;
      return null;
    }
  }

  /* ----------------------------------------------------------- Shell mount */
  async function mountShell(active) {
    const adm = await requireAdmin();
    if (!adm) return null;

    const sb = el('adminSidebar');
    if (sb) sb.innerHTML = sidebarHtml(active);
    const tb = el('adminTopbar');
    if (tb) tb.innerHTML = topbarHtml(active);

    // Sidebar toggle (mobile)
    const toggle = el('btnSidebar');
    const backdrop = el('sidebarBackdrop');
    function close() { sb && sb.classList.remove('open'); backdrop && backdrop.classList.remove('show'); }
    if (toggle) toggle.addEventListener('click', function () {
      sb.classList.toggle('open'); backdrop.classList.toggle('show');
    });
    if (backdrop) backdrop.addEventListener('click', close);

    // Logout
    const lo = el('navLogout');
    if (lo) lo.addEventListener('click', async function (e) {
      e.preventDefault();
      try { await api.logout(); } catch (_) {}
      location.href = '/admin/index.html';
    });

    // Refresh button
    const rf = el('btnRefreshTop');
    if (rf) rf.addEventListener('click', function () { location.reload(); });

    return adm;
  }

  /* ------------------------------------------------------------- Modal util */
  function showModal(id) {
    const m = el(id);
    if (!m) return null;
    const inst = bootstrap.Modal.getOrCreateInstance(m);
    inst.show();
    return inst;
  }
  function hideModal(id) {
    const m = el(id);
    if (!m) return;
    bootstrap.Modal.getOrCreateInstance(m).hide();
  }

  /* -------------------------------------------------------- Confirm dialog */
  function confirmAction(message, { title = 'Konfirmasi', danger = false, okText = 'Ya, lanjutkan' } = {}) {
    return new Promise((resolve) => {
      let box = el('hvyConfirmModal');
      if (!box) {
        box = document.createElement('div');
        box.id = 'hvyConfirmModal';
        box.className = 'modal fade';
        box.innerHTML =
          '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
            '<div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
            '<div class="modal-body"><p class="mb-0" id="hvyConfirmMsg"></p></div>' +
            '<div class="modal-footer">' +
              '<button type="button" class="btn btn-hvy-ghost" data-bs-dismiss="modal">Batal</button>' +
              '<button type="button" class="btn btn-hvy" id="hvyConfirmOk"></button>' +
            '</div>' +
          '</div></div>';
        document.body.appendChild(box);
      }
      box.querySelector('.modal-title').textContent = title;
      box.querySelector('#hvyConfirmMsg').textContent = message;
      const okBtn = box.querySelector('#hvyConfirmOk');
      okBtn.textContent = okText;
      okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-hvy');
      const inst = bootstrap.Modal.getOrCreateInstance(box);
      const handler = function () { inst.hide(); resolve(true); okBtn.removeEventListener('click', handler); };
      okBtn.addEventListener('click', handler);
      box.addEventListener('hidden.bs.modal', function onHidden() {
        box.removeEventListener('hidden.bs.modal', onHidden);
        resolve(false);
      });
      inst.show();
    });
  }

  /* ------------------------------------------------------------ Pagination */
  function renderPagination(container, { total, limit, offset, onChange }) {
    const node = typeof container === 'string' ? el(container) : container;
    if (!node) return;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const cur = Math.floor(offset / limit) + 1;
    if (pages <= 1) { node.innerHTML = ''; return; }

    let html = '';
    html += '<button class="btn btn-hvy-ghost btn-sm" data-page="' + (cur - 1) + '"' + (cur <= 1 ? ' disabled' : '') + '><i class="bi bi-chevron-left"></i></button>';
    const start = Math.max(1, cur - 2);
    const end = Math.min(pages, start + 4);
    for (let p = start; p <= end; p++) {
      html += '<button class="btn btn-sm ' + (p === cur ? 'btn-hvy' : 'btn-hvy-ghost') + '" data-page="' + p + '">' + p + '</button>';
    }
    html += '<button class="btn btn-hvy-ghost btn-sm" data-page="' + (cur + 1) + '"' + (cur >= pages ? ' disabled' : '') + '><i class="bi bi-chevron-right"></i></button>';
    node.innerHTML = html;
    node.querySelectorAll('button[data-page]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = Number(b.dataset.page);
        if (p >= 1 && p <= pages && p !== cur) onChange((p - 1) * limit);
      });
    });
  }

  /* ------------------------------------------------------------- Status UI */
  function topupBadge(status) {
    const map = {
      PENDING: 'st-pending', PAID: 'st-paid', PROCESSING: 'st-processing',
      SUCCESS: 'st-success', FAILED: 'st-failed', EXPIRED: 'st-expired',
      REFUNDED: 'st-refunded', CANCELLED: 'st-cancelled',
    };
    const cls = map[status] || 'st-pending';
    return '<span class="badge-status ' + cls + '">' + HVY.escapeHtml(status) + '</span>';
  }

  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(filename, rows, columns) {
    const head = columns.map((c) => csvEscape(c.label)).join(',');
    const body = rows.map((r) => columns.map((c) => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
    const blob = new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  window.ADMIN = {
    api: admin,
    nav: ADMIN_NAV,
    requireAdmin,
    mountShell,
    showModal,
    hideModal,
    confirmAction,
    renderPagination,
    topupBadge,
    downloadCsv,
    get me() { return _admin; },
  };
})();
