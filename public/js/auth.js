/* ==========================================================================
   HEAVY STORE TOP UP — Auth pages (login / register)
   Handles both pages via a data attribute on <body>.
   ========================================================================== */
(function () {
  'use strict';
  const HVY = window.HVY;
  const api = HVY.api;
  const el = (id) => document.getElementById(id);

  function setErr(id, msg) {
    const box = el(id);
    if (!box) return;
    if (!msg) { box.classList.add('d-none'); box.textContent = ''; return; }
    box.classList.remove('d-none');
    box.innerHTML = '<i class="bi bi-exclamation-triangle me-1"></i>' + HVY.escapeHtml(msg);
  }

  function fieldErr(input, msg) {
    if (!input) return;
    input.classList.toggle('is-invalid', !!msg);
    const fb = input.parentElement.querySelector('.invalid-feedback');
    if (fb && msg) fb.textContent = msg;
  }

  function nextUrl() {
    const n = HVY.param('next');
    if (n && /^\/(?!\/)/.test(n)) return n; // only allow same-site relative paths
    return '/profile.html';
  }

  /* ------------------------------------------------------------------ Login */
  function initLogin() {
    const form = el('loginForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      setErr('authError', '');
      const identifier = el('identifier').value.trim();
      const password = el('password').value;
      let bad = false;
      if (!identifier) { fieldErr(el('identifier'), 'Wajib diisi'); bad = true; } else fieldErr(el('identifier'), '');
      if (!password) { fieldErr(el('password'), 'Wajib diisi'); bad = true; } else fieldErr(el('password'), '');
      if (bad) return;

      const btn = el('btnSubmit');
      HVY.setLoading(btn, true);
      try {
        const res = await api.login(identifier, password);
        HVY.toast('Selamat datang, ' + (res.user ? res.user.username : '') + '!', 'success');
        setTimeout(() => { location.href = nextUrl(); }, 500);
      } catch (err) {
        setErr('authError', err.message || 'Gagal masuk');
        HVY.setLoading(btn, false);
      }
    });

    // Show/hide password
    const toggle = el('togglePw');
    if (toggle) toggle.addEventListener('click', function () {
      const pw = el('password');
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      toggle.innerHTML = '<i class="bi bi-eye' + (show ? '-slash' : '') + '"></i>';
    });
  }

  /* --------------------------------------------------------------- Register */
  function initRegister() {
    const form = el('registerForm');
    if (!form) return;

    // Prefill referral code from ?ref=
    const ref = HVY.param('ref');
    if (ref && el('referral_code')) el('referral_code').value = ref.toUpperCase();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      setErr('authError', '');
      const username = el('username').value.trim();
      const email = el('email').value.trim();
      const phone = el('phone').value.trim();
      const password = el('password').value;
      const confirm = el('confirm').value;
      const referral_code = el('referral_code').value.trim().toUpperCase();

      let bad = false;
      if (!/^[a-zA-Z0-9._]{3,20}$/.test(username)) { fieldErr(el('username'), '3-20 karakter (huruf, angka, . _)'); bad = true; } else fieldErr(el('username'), '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldErr(el('email'), 'Email tidak valid'); bad = true; } else fieldErr(el('email'), '');
      if (!/^[0-9+\-\s]{8,20}$/.test(phone)) { fieldErr(el('phone'), 'Nomor tidak valid'); bad = true; } else fieldErr(el('phone'), '');
      if (password.length < 8) { fieldErr(el('password'), 'Minimal 8 karakter'); bad = true; } else fieldErr(el('password'), '');
      if (confirm !== password) { fieldErr(el('confirm'), 'Konfirmasi tidak cocok'); bad = true; } else fieldErr(el('confirm'), '');
      if (bad) return;

      const btn = el('btnSubmit');
      HVY.setLoading(btn, true);
      try {
        const payload = { username, email, phone, password };
        if (referral_code) payload.referral_code = referral_code;
        const res = await api.register(payload);
        HVY.toast('Akun berhasil dibuat. Selamat bergabung!', 'success');
        setTimeout(() => { location.href = nextUrl(); }, 600);
      } catch (err) {
        setErr('authError', err.message || 'Gagal mendaftar');
        HVY.setLoading(btn, false);
      }
    });

    // Password strength meter
    const pw = el('password');
    const meter = el('pwMeter');
    if (pw && meter) pw.addEventListener('input', function () {
      const v = pw.value;
      let score = 0;
      if (v.length >= 8) score++;
      if (/[A-Z]/.test(v)) score++;
      if (/[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      const pct = (score / 4) * 100;
      meter.style.width = pct + '%';
      meter.className = 'progress-bar ' + (score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : score === 3 ? 'bg-info' : 'bg-success');
    });
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const mode = document.body.dataset.auth;
    await HVY.mountChrome(mode === 'login' ? 'login' : 'register');
    // If already logged in, bounce to profile
    const user = await HVY.currentUser();
    if (user) { location.href = nextUrl(); return; }
    if (mode === 'login') initLogin();
    if (mode === 'register') initRegister();
  });
})();
