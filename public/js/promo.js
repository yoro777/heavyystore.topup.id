/* ==========================================================================
   HEAVY STORE TOP UP — Promo page
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;
  const el = (id) => document.getElementById(id);

  function refCard(r) {
    const val = r.discount_type === 'percent'
      ? r.discount_value + '%'
      : HVY.fmt(r.discount_value);
    const cap = (r.discount_type === 'percent' && r.max_discount > 0)
      ? ' (maks ' + HVY.fmt(r.max_discount) + ')'
      : '';
    const min = r.min_transaction > 0 ? 'Min. transaksi ' + HVY.fmt(r.min_transaction) : 'Tanpa minimum transaksi';
    return '<div class="col-md-6">' +
      '<div class="hvy-card hvy-card-lift p-3 h-100">' +
        '<div class="d-flex justify-content-between align-items-start gap-2">' +
          '<div>' +
            '<div class="fs-5 fw-bold mono silver-text">' + HVY.escapeHtml(r.code) + '</div>' +
            '<div class="small text-muted-2">' + HVY.escapeHtml(r.description || '') + '</div>' +
          '</div>' +
          '<span class="badge-silver">-' + val + '</span>' +
        '</div>' +
        '<div class="divider-silver my-3"></div>' +
        '<div class="d-flex justify-content-between align-items-center">' +
          '<span class="small text-muted-2">' + HVY.escapeHtml(min) + cap + '</span>' +
          '<button class="btn btn-hvy-outline btn-sm" data-code="' + HVY.escapeHtml(r.code) + '">' +
            '<i class="bi bi-clipboard me-1"></i>Salin</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function promoCard(p) {
    const logo = p.game && p.game.logo_url ? p.game.logo_url : '/assets/logo.png';
    const gname = p.game ? p.game.name : '';
    const slug = p.game ? p.game.slug : '';
    const old = p.original_price && p.original_price > p.price
      ? '<span class="n-old">' + HVY.fmt(p.original_price) + '</span>' : '';
    return '<div class="col-6 col-md-4 col-lg-3">' +
      '<a href="/topup.html?game=' + encodeURIComponent(slug) + '" class="game-card hvy-card hvy-card-lift d-block h-100 text-decoration-none">' +
        '<span class="ribbon ribbon-promo">-' + (p.discount || 0) + '%</span>' +
        '<div class="thumb"><img src="' + HVY.escapeHtml(logo) + '" alt="' + HVY.escapeHtml(gname) + '" loading="lazy"></div>' +
        '<div class="name">' + HVY.escapeHtml(p.name) + '</div>' +
        '<div class="min">' + HVY.escapeHtml(gname) + '</div>' +
        '<div class="d-flex align-items-center gap-2 mt-1">' +
          '<span class="fw-bold silver-text">' + HVY.fmt(p.price) + '</span>' + old +
        '</div>' +
      '</a>' +
    '</div>';
  }

  function emptyState(icon, text) {
    return '<div class="col-12"><div class="empty-state"><i class="bi ' + icon + '"></i><p class="mt-2 mb-0">' + text + '</p></div></div>';
  }

  async function load() {
    try {
      const res = await api.promo();

      if (res.banner && res.banner.enabled) {
        el('promoBanner').querySelector('h1').textContent = res.banner.title;
        el('promoBanner').querySelector('.text-muted-2').textContent = res.banner.subtitle;
      }

      // Referrals
      const refs = res.referrals || [];
      el('refList').innerHTML = refs.length
        ? refs.map(refCard).join('')
        : emptyState('bi-gift', 'Belum ada kode referral aktif.');

      HVY.qsa('#refList button[data-code]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          HVY.copy(btn.dataset.code);
          btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Tersalin';
          setTimeout(() => { btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Salin'; }, 1500);
        });
      });

      // Promo products
      const prods = res.products || [];
      el('promoList').innerHTML = prods.length
        ? prods.map(promoCard).join('')
        : emptyState('bi-tags', 'Belum ada item promo saat ini. Cek lagi nanti ya!');
    } catch (err) {
      el('refList').innerHTML = emptyState('bi-wifi-off', HVY.escapeHtml(err.message));
      el('promoList').innerHTML = '';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await HVY.mountChrome('promo');
    load();
  });
})();
