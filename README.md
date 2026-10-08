# HEAVY STORE TOP UP

> **Top Up Game Cepat, Aman & Otomatis**

Platform top up game full-stack (frontend + serverless API + PostgreSQL) yang
production-ready, mobile-first, dan siap deploy ke **Vercel**. Semua pembayaran
dan pengiriman top up dilakukan melalui **API resmi** (payment gateway &
supplier), dengan seluruh harga, diskon, status pembayaran, dan status top up
**dihitung & diverifikasi di sisi server**.

---

## Daftar Isi

1. [Fitur Utama](#1-fitur-utama)
2. [Prinsip Keamanan](#2-prinsip-keamanan)
3. [Tech Stack](#3-tech-stack)
4. [Struktur Proyek](#4-struktur-proyek)
5. [Persiapan Lokal](#5-persiapan-lokal)
6. [Variabel Lingkungan (.env)](#6-variabel-lingkungan-env)
7. [Setup Database](#7-setup-database)
8. [Menjalankan Secara Lokal](#8-menjalankan-secara-lokal)
9. [Membuat Akun Admin Pertama](#9-membuat-akun-admin-pertama)
10. [Konfigurasi Payment Gateway](#10-konfigurasi-payment-gateway)
11. [Konfigurasi Supplier Top Up](#11-konfigurasi-supplier-top-up)
12. [Deploy ke Vercel](#12-deploy-ke-vercel)
13. [Setup GitHub](#13-setup-github)
14. [Referensi API](#14-referensi-api)
15. [Alur Order & Idempotensi](#15-alur-order--idempotensi)
16. [Troubleshooting](#16-troubleshooting)
17. [Lisensi](#17-lisensi)

---

## 1. Fitur Utama

**Toko / Publik**
- Landing page premium (silver / putih / hitam) dengan hero, katalog 26 game,
  banner promo, dan animasi halus.
- Katalog **26 game**: Free Fire, Free Fire MAX, Mobile Legends, Roblox, PUBG
  Mobile, PUBG PC, Valorant, Counter-Strike 2, Dota 2, Point Blank, Fortnite,
  Honor of Kings, Genshin Impact, Call of Duty Mobile, League of Legends, Wild
  Rift, Arena of Valor, Clash of Clans, Clash Royale, EA SPORTS FC Mobile,
  eFootball, Minecraft, Steam Wallet, PlayStation Store, Nintendo eShop,
  Xbox/Microsoft Store.
- Alur top up: pilih game → isi User ID / Server ID → pilih nominal → pilih
  metode pembayaran → bayar.
- **Cek Pesanan** tanpa login (via Order ID).
- Halaman **Promo**, **Bantuan/FAQ**, **Syarat & Ketentuan**, **Privacy Policy**.
- Navigasi mobile bawah: Home · Top Up · Pesanan · Promo · Akun.

**Akun Pelanggan**
- Registrasi, login, profil, riwayat transaksi, notifikasi in-app.
- Sistem **referral** (kode diskon dengan batas maksimum, mis. `HEAVY10` = 10%,
  maksimal Rp10.000).

**Admin Panel** (`/admin`)
- Dashboard statistik + grafik, transaksi, game, produk, customer, referral,
  payment gateway, supplier, notifikasi, pengaturan, dan audit log.

**Pembayaran (Indonesia)**
- QRIS, DANA, OVO, GoPay, ShopeePay, BCA/BNI/BRI/Mandiri/Permata/CIMB Virtual
  Account, Alfamart, Indomaret.
- Webhook dengan **verifikasi signature**, idempotensi, auto-expire order.

**Pricing Dinamis (server-side)**
- `supplier_cost`, `selling_price`, `margin_type`, `margin_value`, `promo`,
  `min_price`, `max_discount` — selalu dihitung di server dan **tidak pernah di
  bawah harga modal + margin minimum**.

---

## 2. Prinsip Keamanan

Prioritas pengembangan (berurutan): **1) Keamanan → 2) Stabilitas → 3) Tanpa
pembayaran palsu → 4) Tanpa double top up → 5) Validasi server-side → 6)
Pembayaran otomatis → 7) Top up otomatis → 8) Harga kompetitif + profit aman →
9) Responsif mobile → 10) UI premium.**

- **Tanpa pembayaran palsu.** Tidak ada tombol/simulasi "berhasil" di frontend.
  Status pembayaran hanya berubah lewat **webhook resmi** yang terverifikasi
  signature, atau pengecekan status ke gateway di server.
- **Tanpa kredensial di frontend.** Semua secret (gateway, supplier, JWT,
  database) hanya ada di server via environment variables.
- **Tanpa harga dari browser.** Harga, diskon, biaya, dan total selalu dihitung
  ulang di server saat membuat order.
- **Tanpa double top up.** Idempotency key pada order & pengiriman top up
  (`supplier_reference` + `processed_at`), dengan row-locking (`FOR UPDATE`).
- **Password** di-hash dengan bcrypt (12 rounds). Sesi via **JWT HttpOnly,
  SameSite** cookie (tidak dapat diakses JavaScript).
- **Rate limiting** berbasis database (tetap berlaku antar cold start).
- **Audit log** untuk aksi admin penting.
- **Secret supplier** disimpan terenkripsi **AES-256-GCM** (`enc:v1:` format).
- Header keamanan (nosniff, frame-options, referrer-policy, permissions-policy)
  diatur di `vercel.json`.

---

## 3. Tech Stack

| Layer      | Teknologi |
|------------|-----------|
| Frontend   | HTML5, CSS3, Bootstrap 5, Bootstrap Icons, Vanilla JavaScript |
| Backend    | Node.js serverless functions (Vercel `/api`) |
| Database   | PostgreSQL (Neon / Supabase / Vercel Postgres / RDS) |
| Auth       | JWT (HttpOnly cookie) + bcryptjs |
| Payment    | Midtrans Core API, DANA Merchant Open API |
| Supplier   | Digiflazz, VIP Reseller, generic adapter |
| Deploy     | Vercel (static `public/` + serverless `api/`) |

---

## 4. Struktur Proyek

```
heavy-store-repo/
├── api/                        # Serverless API (Vercel functions)
│   ├── _lib/                   # Core libraries (db, auth, pricing, ...)
│   │   ├── payments/           # Payment gateway abstraction + adapters
│   │   └── suppliers/          # Supplier abstraction + adapters
│   ├── auth/                   # register, login, logout, me, admin-*
│   ├── games/                  # catalog: games, games/[id]
│   ├── products/               # products list
│   ├── orders/                 # create, list, [id], check
│   ├── payment/                # methods, status
│   ├── referral/               # validate
│   ├── supplier/               # validate
│   ├── notifications/          # in-app notifications
│   ├── promo/                  # public promo feed
│   ├── settings/               # public settings
│   ├── webhook/                # payment, supplier
│   ├── admin/                  # admin endpoints
│   └── cron/                   # expire-orders
├── public/                     # Static frontend (outputDirectory)
│   ├── assets/                 # logo, favicon, game logos, payment logos
│   ├── css/                    # style.css, admin.css
│   ├── js/                     # api.js, app.js, auth.js, topup.js, ...
│   ├── admin/                  # Admin Panel (login + 11 halaman)
│   └── *.html                  # index, topup, check-order, promo, ...
├── database/
│   ├── schema.sql              # semua tabel, index, constraint, trigger
│   └── seed.sql                # 26 game, metode bayar, settings, referral
├── scripts/
│   ├── db-setup.js             # npm run db:setup
│   ├── db-seed.js              # npm run db:seed
│   ├── catalog.js              # katalog nominal produk
│   └── _env.js                 # loader .env sederhana
├── .env.example                # contoh environment variables
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

## 5. Persiapan Lokal

Prasyarat:
- **Node.js ≥ 18**
- **PostgreSQL** (lokal atau cloud: Neon/Supabase/Vercel Postgres)
- **Vercel CLI** (`npm i -g vercel`) — untuk menjalankan serverless API lokal
- Akun **Midtrans** dan/atau **DANA** (mode sandbox untuk uji coba)
- Akun **supplier** (mis. Digiflazz) untuk top up otomatis

```bash
# 1. Clone
git clone https://github.com/yoro777/heavyystore.topup.id.git
cd heavyystore.topup.id

# 2. Install dependency
npm install

# 3. Siapkan environment
cp .env.example .env
#   lalu edit .env dan isi nilainya
```

---

## 6. Variabel Lingkungan (.env)

Seluruh nilai di bawah bersifat **server-side**. Jangan pernah commit `.env`.

| Variabel | Wajib | Keterangan |
|----------|:----:|------------|
| `APP_URL` | ✅ | URL publik deployment (mis. `https://heavyystore.vercel.app`) |
| `NODE_ENV` | ✅ | `production` / `development` |
| `DATABASE_URL` | ✅ | Connection string PostgreSQL (`?sslmode=require` untuk cloud) |
| `JWT_SECRET` | ✅ | Secret penandatangan JWT (min. 32 char). `openssl rand -hex 32` |
| `ADMIN_SECRET` | ✅ | Secret sekali pakai untuk membuat admin pertama |
| `PAYMENT_PROVIDER` | ✅ | `midtrans` atau `dana` |
| `MIDTRANS_SERVER_KEY` | ⬜* | Server key Midtrans (rahasia) |
| `MIDTRANS_CLIENT_KEY` | ⬜* | Client key Midtrans |
| `MIDTRANS_IS_PRODUCTION` | ⬜ | `true` untuk produksi |
| `DANA_CLIENT_ID` | ⬜* | Client ID DANA Merchant |
| `DANA_CLIENT_SECRET` | ⬜* | Client secret DANA |
| `DANA_MERCHANT_ID` | ⬜* | Merchant ID DANA |
| `DANA_ENV` | ⬜ | `sandbox` / `production` |
| `SUPPLIER_ADAPTER` | ✅ | `digiflazz` / `vipreseller` / `generic` |
| `SUPPLIER_API_URL` | ⬜* | URL API supplier |
| `SUPPLIER_API_KEY` | ⬜* | API key supplier |
| `SUPPLIER_USERNAME` | ⬜* | Username supplier |
| `SUPPLIER_SECRET` | ⬜* | Secret / private key supplier |
| `SECRETS_KEY` | ⬜ | Kunci enkripsi secret di DB (fallback ke `JWT_SECRET`) |
| `CRON_SECRET` | ⬜ | Secret untuk mengamankan Vercel Cron |
| `RESEND_API_KEY` | ⬜ | Notifikasi email (opsional) |
| `WHATSAPP_API_TOKEN` | ⬜ | Notifikasi WhatsApp (opsional) |
| `ALLOWED_ORIGINS` | ⬜ | Daftar origin CORS dipisah koma |

\* Wajib bila kanal/gateway/supplier terkait diaktifkan.

> **Tips:** buat `JWT_SECRET` & `SECRETS_KEY` yang berbeda, dan `ADMIN_SECRET`
> yang acak. Contoh: `openssl rand -hex 32`.

---

## 7. Setup Database

```bash
# Terapkan skema (semua tabel, index, constraint, trigger)
npm run db:setup

# Isi data awal: 26 game, 13 metode pembayaran, settings, referral contoh,
# dan katalog produk (nominal) untuk seluruh game
npm run db:seed
```

Keduanya **idempotent** — aman dijalankan berulang. `db:seed` tidak akan
menimpa produk yang sudah ada (berdasarkan nama dalam game yang sama), sehingga
perubahan dari Admin Panel tetap aman.

> Ingin menjalankan SQL manual? Gunakan:
> `psql "$DATABASE_URL" -f database/schema.sql` lalu
> `psql "$DATABASE_URL" -f database/seed.sql`.

---

## 8. Menjalankan Secara Lokal

```bash
# Menjalankan frontend (public/) + serverless API (api/) sekaligus
npm run dev
#  → Vercel dev akan menyajikan di http://localhost:3000
```

Buka `http://localhost:3000` untuk situs publik, dan
`http://localhost:3000/admin` untuk Admin Panel.

---

## 9. Membuat Akun Admin Pertama

Admin pertama dibuat **sekali** melalui endpoint bootstrap (hanya aktif saat
tabel `admins` masih kosong). Bisa lewat halaman login admin (tombol
*Bootstrap Admin*) atau via API:

```bash
curl -X POST https://<APP_URL>/api/auth/admin-bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "admin_secret": "<ADMIN_SECRET>",
    "username": "superadmin",
    "email": "admin@heavyystore.topup.id",
    "password": "<password-kuat-min-10-char>"
  }'
```

Setelah admin pertama dibuat, endpoint bootstrap **otomatis dinonaktifkan**.
Selanjutnya login di `/admin` dengan username/email + password tersebut.

---

## 10. Konfigurasi Payment Gateway

### 10.1 Midtrans (Core API)

1. Daftar/masuk ke [Midtrans Dashboard](https://dashboard.midtrans.com).
2. Ambil **Server Key** dan **Client Key** (Sandbox dulu untuk uji coba).
3. Isi `.env`:
   ```env
   PAYMENT_PROVIDER=midtrans
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxx
   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```
4. Set **Payment Notification URL** di dashboard Midtrans ke:
   ```
   https://<APP_URL>/api/webhook/payment?provider=midtrans
   ```
5. Aktifkan metode pembayaran yang diinginkan (QRIS, VA, e-wallet, gerai
   retail). Metode ini juga dikelola di Admin Panel → **Payment Gateway**.

### 10.2 DANA (Merchant Open API)

1. Dapatkan kredensial dari DANA Merchant Portal.
2. Isi `.env`:
   ```env
   DANA_CLIENT_ID=xxxxxxxx
   DANA_CLIENT_SECRET=xxxxxxxx
   DANA_MERCHANT_ID=xxxxxxxx
   DANA_ENV=sandbox
   ```
3. Arahkan notifikasi/callback DANA ke:
   ```
   https://<APP_URL>/api/webhook/payment?provider=dana
   ```

> Webhook **selalu** diverifikasi signature-nya sebelum diproses, dicatat di
> `webhook_logs`, dan bersifat **idempotent** (notifikasi berulang tidak akan
> memproses order dua kali).

---

## 11. Konfigurasi Supplier Top Up

Supplier diakses lewat abstraksi `validateUserID()`, `createTopup()`,
`checkTopupStatus()`, dan `cancelTopup()`. Adapter yang tersedia:
`digiflazz`, `vipreseller`, dan `generic`.

### 11.1 Digiflazz

```env
SUPPLIER_ADAPTER=digiflazz
DIGIFLAZZ_USERNAME=username-digiflazz
DIGIFLAZZ_API_KEY=api-key-digiflazz
DIGIFLAZZ_API_URL=https://api.digiflazz.com/v1
```

Arahkan **webhook** Digiflazz ke:
```
https://<APP_URL>/api/webhook/supplier?provider=digiflazz
```

### 11.2 VIP Reseller / Generic

```env
SUPPLIER_ADAPTER=vipreseller
VIPRESELLER_API_URL=https://vip-reseller.co.id/api
VIPRESELLER_API_KEY=xxxxxxxx
VIPRESELLER_MERCHANT_ID=xxxxxxxx
```

### 11.3 Mengelola Supplier di Admin Panel

Buka **Admin Panel → Supplier** untuk menambah/mengedit supplier, mengisi
kredensial (disimpan terenkripsi), dan menekan **Tes Koneksi**. Kode produk
(`supplier_code`) dipetakan per produk di **Admin Panel → Produk**.

---

## 12. Deploy ke Vercel

1. Import repo GitHub ke Vercel (atau `vercel` dari CLI).
2. **Framework Preset**: Other. **Output Directory**: `public` (sudah diatur di
   `vercel.json`).
3. Tambahkan semua environment variables dari `.env` di
   **Project → Settings → Environment Variables**.
4. Deploy. Setelah selesai, jalankan `db:setup` & `db:seed` terhadap
   `DATABASE_URL` produksi (mis. dari mesin lokal), lalu buat admin pertama.
5. Set URL webhook Midtrans/DANA/supplier ke domain produksi.

`vercel.json` sudah menyertakan:
- **Cron** `*/10 * * * *` → `/api/cron/expire-orders` (expire order & refresh
  status top up).
- **Header** keamanan.
- **Rewrite** `/admin` → `/admin/index.html`.

> Aktifkan **Vercel Cron** dan set `CRON_SECRET` agar endpoint cron aman.

---

## 13. Setup GitHub

```bash
git init
git add .
git commit -m "feat: HEAVY STORE TOP UP — full-stack game top up platform"
git branch -M main
git remote add origin https://github.com/yoro777/heavyystore.topup.id.git
git push -u origin main
```

`.gitignore` sudah mengecualikan `.env`, `node_modules`, `.vercel`, dan file
sensitif lain. **Pastikan `.env` tidak pernah ter-commit.**

---

## 14. Referensi API

Semua respons berbentuk `{ "success": true, ... }` atau
`{ "success": false, "error": "..." }`. Autentikasi memakai cookie HttpOnly.

### Publik
| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/games` | Daftar game |
| GET | `/api/games/:id` | Detail game + produk |
| GET | `/api/products?game_id=` | Produk per game |
| GET | `/api/payment/methods` | Metode pembayaran aktif |
| GET | `/api/promo` | Feed promo (produk + referral publik) |
| GET | `/api/settings/public` | Pengaturan publik |
| POST | `/api/referral/validate` | Validasi kode referral |
| POST | `/api/supplier/validate` | Validasi User ID / Server ID |
| POST | `/api/orders/create` | Buat order (harga dihitung server) |
| POST | `/api/orders/check` | Cek order via Order ID |
| GET | `/api/payment/status?order_id=` | Cek status pembayaran (server) |

### Akun
| Method | Endpoint | Keterangan |
|--------|----------|------------|
| POST | `/api/auth/register` | Registrasi |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Profil + statistik |
| GET | `/api/orders` | Riwayat order |
| GET | `/api/orders/:id` | Detail order |
| GET/POST | `/api/notifications` | Notifikasi in-app |

### Admin (auth admin)
`/api/admin/dashboard`, `/transactions`, `/games`, `/products`, `/customers`,
`/referrals`, `/payment-methods`, `/suppliers`, `/settings`, `/notifications`,
`/audit-logs`, `/test-connection`, `/me`.

### Webhook
`/api/webhook/payment?provider=midtrans|dana`, `/api/webhook/supplier`.

---

## 15. Alur Order & Idempotensi

```
PENDING ──(webhook PAID)──▶ PAID ──▶ PROCESSING ──▶ SUCCESS
   │                                    │
   │ (expired / cancel)                 └──(gagal)──▶ FAILED ──▶ REFUNDED
   ▼
EXPIRED / CANCELLED
```

- Order dibuat dengan `idempotency_key` unik → klik berulang tidak membuat
  order ganda.
- Setelah pembayaran **PAID**, top up dikirim ke supplier **tepat sekali**
  (dijaga oleh `processed_at` + `supplier_reference` + row lock).
- Cron setiap 10 menit meng-expire order yang belum dibayar dan menyegarkan
  status order yang masih `PROCESSING`.

---

## 16. Troubleshooting

| Masalah | Solusi |
|---------|--------|
| `DATABASE_URL is not configured` | Isi `DATABASE_URL` di `.env` / Vercel |
| Error SSL saat konek DB | Tambahkan `?sslmode=require` pada `DATABASE_URL` |
| Login admin gagal terus | Pastikan admin sudah dibuat & password benar |
| Webhook ditolak (403) | Cek signature key / notification URL gateway |
| Top up tidak jalan | Cek kredensial supplier & mapping `supplier_code` produk |
| Harga terlihat aneh | Periksa `supplier_cost`, `margin`, `min_price`, promo produk |
| Cron tidak jalan | Set `CRON_SECRET` & aktifkan Vercel Cron |

---

## 17. Lisensi

© 2026 **HEAVY STORE TOP UP** — All Rights Reserved.

Dibuat dengan ❤️ di Indonesia.
