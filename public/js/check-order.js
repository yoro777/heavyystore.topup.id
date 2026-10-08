/* ==========================================================================
   HEAVY STORE TOP UP — Check order page
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;
  const el = (id) => document.getElementById(id);

  function renderOrder(o) {
    el('result').classList.remove('d-none');
    el('result').innerHTML =
      '<div class="hvy-card p-4">' +
        '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">' +
          '<div><div class="text-muted-2 small">Order ID</div><div class="fw-bold mono">' + HVY.escapeHtml(o.order_id) + '</div></div>' +
          HVY.statusBadge(o.status) +
        '</div>' +
        '<div class="row g-3">' +
          '<div class="col-sm-6"><div class="kv"><span class="k">Game</span><span class="v">' + HVY.escapeHtml(o.game ? o.game.name : '-') + '</span></div></div>' +
          '<div class="col-sm-6"><div class="kv"><span class="k">Item</span><span class="v">' + HVY.escapeHtml(o.product ? o.product.name : '-') + '</span></div></div>' +
          '<div class="col-sm-6"><div class="kv"><span class="k">User ID</span><span class="v mono">' + HVY.escapeHtml(o.game_user_id) + '</span></div></div>' +
          '<div class="col-sm-6"><div class="kv"><span class="k">Metode</span><span class="v">' + HVY.escapeHtml(o.payment_method || '-') + '</span></div></div>' +
          '<div class="col-sm-6"><div class="kv"><span class="k">Total</span><span class="v">' + HVY.fmt(o.grand_total) + '</span></div></div>' +
          '<div class="col-sm-6"><div class="kv"><span class="k">Dibuat</span><span class="v">' + HVY.fmtDate(o.created_at) + '</span></div></div>' +
        '</div>' +
        '<a href="/order.html?order=' + encodeURIComponent(o.order_id) + '" class="btn btn-hvy w-100 mt-3"><i class="bi bi-box-arrow-up-right me-2"></i>Lihat Detail &amp; Instruksi Pembayaran</a>' +
      '</div>';
  }

  async function submit(e) {
    if (e) e.preventDefault();
    const id = el('orderId').value.trim();
    if (!id) { HVY.toast('Masukkan Order ID', 'warning'); return; }
    const btn = el('btnCheck');
    HVY.setLoading(btn, true);
    el('result').classList.add('d-none');
    try {
      const res = await api.checkOrder(id);
      renderOrder(res.order);
    } catch (err) {
      el('result').classList.remove('d-none');
      el('result').innerHTML = '<div class="alert alert-danger mb-0"><i class="bi bi-exclamation-triangle me-1"></i>' + HVY.escapeHtml(err.message) + '</div>';
    } finally {
      HVY.setLoading(btn, false);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await HVY.mountChrome('check');
    el('form').addEventListener('submit', submit);
    const pre = HVY.param('order');
    if (pre) { el('orderId').value = pre; submit(); }
  });
})();
