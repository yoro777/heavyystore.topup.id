/* ==========================================================================
   HEAVY STORE TOP UP — Order detail / payment page
   Shows payment instructions, a countdown, a status timeline, and polls the
   SERVER for the real payment status (never trusts the browser).
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;

  let orderId = null;
  let pollTimer = null;
  let countdownTimer = null;
  let order = null;

  const el = (id) => document.getElementById(id);

  function stepsHtml(o) {
    const seq = ['PENDING', 'PAID', 'PROCESSING', 'SUCCESS'];
    const idx = o.status === 'SUCCESS' ? 3 : o.status === 'PROCESSING' ? 2 : o.payment_status === 'PAID' || o.status === 'PAID' ? 1 : 0;
    const labels = ['Pembayaran', 'Dibayar', 'Diproses', 'Selesai'];
    return seq.map((s, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'active' : '';
      return '<div class="text-center flex-fill"><div class="step-dot ' + cls + ' mx-auto mb-1">' + (i < idx ? '<i class="bi bi-check"></i>' : i + 1) + '</div><div class="small ' + (i <= idx ? 'text-white' : 'text-muted-2') + '">' + labels[i] + '</div></div>';
    }).join('<div class="flex-fill align-self-start mt-3"><div class="divider-silver"></div></div>');
  }

  function instructionsHtml(o) {
    const ins = o.payment_instructions || {};
    const parts = [];
    if (ins.qr_url || ins.qr_string) {
      parts.push('<div class="text-center mb-3">');
      if (ins.qr_url) parts.push('<img src="' + HVY.escapeHtml(ins.qr_url) + '" alt="QRIS" class="qr-box mb-2">');
      parts.push('<div class="small text-muted-2">Scan QRIS menggunakan aplikasi e-wallet atau m-banking apa pun.</div>');
      parts.push('</div>');
    }
    if (ins.va_number) {
      parts.push('<div class="kv"><span class="k">Bank</span><span class="v text-uppercase">' + HVY.escapeHtml(ins.bank || '-') + '</span></div>');
      parts.push('<div class="kv"><span class="k">Nomor Virtual Account</span><span class="v"><span class="mono">' + HVY.escapeHtml(ins.va_number) + '</span> <button class="btn btn-hvy-ghost btn-sm py-0 px-2" data-copy="' + HVY.escapeHtml(ins.va_number) + '"><i class="bi bi-copy"></i></button></span></div>');
    }
    if (ins.bill_key) {
      parts.push('<div class="kv"><span class="k">Biller Code</span><span class="v mono">' + HVY.escapeHtml(ins.biller_code || '-') + '</span></div>');
      parts.push('<div class="kv"><span class="k">Bill Key</span><span class="v"><span class="mono">' + HVY.escapeHtml(ins.bill_key) + '</span> <button class="btn btn-hvy-ghost btn-sm py-0 px-2" data-copy="' + HVY.escapeHtml(ins.bill_key) + '"><i class="bi bi-copy"></i></button></span></div>');
    }
    if (ins.payment_code) {
      parts.push('<div class="kv"><span class="k">Kode Pembayaran</span><span class="v"><span class="mono">' + HVY.escapeHtml(ins.payment_code) + '</span> <button class="btn btn-hvy-ghost btn-sm py-0 px-2" data-copy="' + HVY.escapeHtml(ins.payment_code) + '"><i class="bi bi-copy"></i></button></span></div>');
      if (ins.store) parts.push('<div class="kv"><span class="k">Gerai</span><span class="v text-capitalize">' + HVY.escapeHtml(ins.store) + '</span></div>');
    }
    if (ins.deeplink) {
      parts.push('<a href="' + HVY.escapeHtml(ins.deeplink) + '" target="_blank" rel="noopener" class="btn btn-hvy w-100 mt-3"><i class="bi bi-box-arrow-up-right me-2"></i>Buka Aplikasi Pembayaran</a>');
    }
    if (!parts.length) {
      parts.push('<div class="alert alert-info mb-0"><i class="bi bi-info-circle me-1"></i>Instruksi pembayaran akan tampil di sini. Jika belum muncul, tunggu beberapa saat lalu muat ulang halaman.</div>');
    }
    return parts.join('');
  }

  function render() {
    if (!order) return;
    el('orderId').textContent = order.order_id;
    el('statusBadge').innerHTML = HVY.statusBadge(order.status);
    el('steps').innerHTML = stepsHtml(order);

    el('dGame').textContent = order.game ? order.game.name : '-';
    el('dProduct').textContent = order.product ? order.product.name : '-';
    el('dUserId').textContent = order.game_user_id + (order.game_server_id ? ' (' + order.game_server_id + ')' : '');
    el('dNick').textContent = order.game_nickname || '-';
    el('dMethod').textContent = order.payment_method || '-';
    el('dCreated').textContent = HVY.fmtDate(order.created_at);

    el('dBase').textContent = HVY.fmt(order.base_price);
    el('dDiscountRow').classList.toggle('d-none', Number(order.discount_total) <= 0);
    el('dDiscount').textContent = '-' + HVY.fmt(order.discount_total);
    el('dFee').textContent = HVY.fmt(order.payment_fee);
    el('dTotal').textContent = HVY.fmt(order.grand_total);

    const paid = order.payment_status === 'PAID' || ['PAID', 'PROCESSING', 'SUCCESS'].includes(order.status);
    const terminalFail = ['FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(order.status);

    el('payBox').classList.toggle('d-none', paid || terminalFail);
    el('paidBox').classList.toggle('d-none', !paid);
    el('failBox').classList.toggle('d-none', !terminalFail);

    if (!paid && !terminalFail) {
      el('instructions').innerHTML = instructionsHtml(order);
      bindCopy();
      startCountdown();
    } else {
      stopCountdown();
    }

    if (paid) {
      el('paidMsg').innerHTML = order.status === 'SUCCESS'
        ? '<i class="bi bi-check-circle-fill text-success me-2"></i>Top up berhasil! Saldo sudah masuk ke akun game kamu.'
        : '<i class="bi bi-hourglass-split text-warning me-2"></i>Pembayaran diterima. Pesanan sedang diproses otomatis.';
    }
    if (terminalFail) {
      el('failMsg').innerHTML = order.status === 'EXPIRED'
        ? 'Pesanan kedaluwarsa karena melewati batas waktu pembayaran.'
        : order.status === 'REFUNDED'
        ? 'Dana telah dikembalikan ke metode pembayaran kamu.'
        : 'Pesanan gagal atau dibatalkan.';
    }

    // Stop polling when terminal
    if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(order.status)) stopPolling();
  }

  function bindCopy() {
    HVY.qsa('#instructions [data-copy]').forEach((b) => {
      b.addEventListener('click', () => HVY.copy(b.dataset.copy));
    });
  }

  function startCountdown() {
    stopCountdown();
    const target = order.expires_at ? new Date(order.expires_at).getTime() : null;
    if (!target) { el('countdown').classList.add('d-none'); return; }
    el('countdown').classList.remove('d-none');
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { el('countdown').innerHTML = 'Waktu pembayaran habis'; stopCountdown(); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el('countdown').innerHTML = '<i class="bi bi-clock me-1"></i>Bayar dalam <strong>' + m + ':' + String(s).padStart(2, '0') + '</strong>';
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { if (countdownTimer) clearInterval(countdownTimer); countdownTimer = null; }

  async function refresh() {
    try {
      const res = await api.paymentStatus(orderId);
      order = res.order;
      render();
    } catch (err) { /* keep last known state */ }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(refresh, 6000);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  async function init() {
    await HVY.mountChrome('orders');
    orderId = HVY.param('order');
    if (!orderId) {
      el('main').innerHTML = '<div class="empty-state"><i class="bi bi-receipt"></i><p class="mt-2">Order ID tidak ditemukan.</p><a href="/check-order.html" class="btn btn-hvy">Cek Pesanan</a></div>';
      return;
    }
    try {
      const res = await api.order(orderId);
      order = res.order;
      render();
      startPolling();
      el('btnRefresh').addEventListener('click', refresh);
    } catch (err) {
      el('main').innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p class="mt-2">' + HVY.escapeHtml(err.message) + '</p><a href="/check-order.html" class="btn btn-hvy">Cek Pesanan</a></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
