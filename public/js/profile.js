/* ==========================================================================
   HEAVY STORE TOP UP — Customer profile (orders + notifications)
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;
  const el = (id) => document.getElementById(id);

  let ORDERS = [];
  let activeStatus = '';

  function initials(name) {
    return (name || 'H').trim().charAt(0).toUpperCase();
  }

  function renderProfile(user, stats) {
    el('uName').textContent = user.username;
    el('uEmail').innerHTML = '<i class="bi bi-envelope me-1"></i>' + HVY.escapeHtml(user.email);
    el('uPhone').innerHTML = '<i class="bi bi-whatsapp me-1"></i>' + HVY.escapeHtml(user.phone || '-');
    el('uRef').textContent = user.referral_code || '-';
    el('avatar').textContent = initials(user.username);
    if (stats) {
      el('sTotal').textContent = stats.total_transactions || 0;
      el('sSuccess').textContent = stats.total_success || 0;
      el('sSpent').textContent = HVY.fmt(stats.total_spent || 0);
    }
  }

  function orderRow(o) {
    const g = o.game ? o.game.name : '—';
    const p = o.product ? o.product.name : '—';
    return '' +
      '<a href="/order.html?order=' + encodeURIComponent(o.order_id) + '" class="order-row hvy-card p-3 mb-2 text-decoration-none d-block">' +
        '<div class="d-flex justify-content-between align-items-start gap-2">' +
          '<div class="min-w-0">' +
            '<div class="fw-bold text-truncate">' + HVY.escapeHtml(g) + '</div>' +
            '<div class="small text-muted-2 text-truncate">' + HVY.escapeHtml(p) + ' · <span class="mono">' + HVY.escapeHtml(o.game_user_id) + '</span></div>' +
            '<div class="small text-muted-2 mt-1"><i class="bi bi-clock me-1"></i>' + HVY.fmtDate(o.created_at) + ' · <span class="mono">' + HVY.escapeHtml(o.order_id) + '</span></div>' +
          '</div>' +
          '<div class="text-end flex-shrink-0">' +
            HVY.statusBadge(o.status) +
            '<div class="fw-bold mt-1">' + HVY.fmt(o.grand_total) + '</div>' +
          '</div>' +
        '</div>' +
      '</a>';
  }

  function renderOrders() {
    const list = activeStatus ? ORDERS.filter((o) => o.status === activeStatus) : ORDERS;
    if (!list.length) {
      el('ordersList').innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p class="mt-2 mb-0">Belum ada pesanan di sini.</p>' +
        '<a href="/topup.html" class="btn btn-hvy btn-sm mt-3"><i class="bi bi-lightning-charge me-1"></i>Top Up Sekarang</a></div>';
      return;
    }
    el('ordersList').innerHTML = list.map(orderRow).join('');
  }

  function renderNotif(list, unread) {
    const cnt = el('notifCount');
    if (unread > 0) { cnt.textContent = unread; cnt.classList.remove('d-none'); }
    else cnt.classList.add('d-none');

    if (!list.length) {
      el('notifList').innerHTML = '<div class="empty-state"><i class="bi bi-bell-slash"></i><p class="mt-2 mb-0">Belum ada notifikasi.</p></div>';
      return;
    }
    el('notifList').innerHTML = list.map(function (n) {
      const icon = n.type === 'order' ? 'bi-receipt' : n.type === 'payment' ? 'bi-wallet2' : 'bi-info-circle';
      return '<div class="hvy-card p-3 mb-2 notif-item ' + (n.is_read ? '' : 'unread') + '" data-id="' + n.id + '">' +
        '<div class="d-flex gap-3">' +
          '<div class="notif-icon"><i class="bi ' + icon + '"></i></div>' +
          '<div class="min-w-0 flex-grow-1">' +
            '<div class="fw-semibold">' + HVY.escapeHtml(n.title) + '</div>' +
            '<div class="small text-muted-2">' + HVY.escapeHtml(n.message) + '</div>' +
            '<div class="small text-muted-2 mt-1">' + HVY.timeAgo(n.created_at) + '</div>' +
          '</div>' +
          (n.is_read ? '' : '<span class="pulse-dot align-self-center"></span>') +
        '</div>' +
      '</div>';
    }).join('');

    HVY.qsa('#notifList .notif-item').forEach(function (node) {
      node.addEventListener('click', async function () {
        if (node.classList.contains('unread')) {
          try { await api.markNotificationsRead('read', Number(node.dataset.id)); } catch (_) {}
          node.classList.remove('unread');
          const dot = node.querySelector('.pulse-dot'); if (dot) dot.remove();
        }
        const id = node.dataset.orderId;
      });
    });
  }

  async function loadOrders() {
    try {
      const res = await api.myOrders(50, 0);
      ORDERS = res.orders || [];
      renderOrders();
    } catch (err) {
      el('ordersList').innerHTML = '<div class="alert alert-danger">' + HVY.escapeHtml(err.message) + '</div>';
    }
  }

  async function loadNotifs() {
    try {
      const res = await api.notifications(30);
      renderNotif(res.notifications || [], res.unread || 0);
    } catch (err) {
      el('notifList').innerHTML = '<div class="alert alert-danger">' + HVY.escapeHtml(err.message) + '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await HVY.mountChrome('profile');
    const user = await HVY.requireAuth('/login.html');
    if (!user) return;
    renderProfile(user, HVY.userStats);

    el('btnLogout').addEventListener('click', async function () {
      try { await api.logout(); } catch (_) {}
      HVY.toast('Kamu telah keluar.', 'info');
      setTimeout(() => { location.href = '/index.html'; }, 400);
    });

    el('btnCopyRef').addEventListener('click', function () {
      HVY.copy(el('uRef').textContent);
    });

    el('orderFilters').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-status]');
      if (!btn) return;
      HVY.qsa('#orderFilters .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      renderOrders();
    });

    el('btnReadAll').addEventListener('click', async function () {
      try {
        await api.markNotificationsRead('read_all');
        await loadNotifs();
        HVY.toast('Semua notifikasi ditandai dibaca', 'success');
      } catch (err) { HVY.toast(err.message, 'danger'); }
    });

    await Promise.all([loadOrders(), loadNotifs()]);
  });
})();
