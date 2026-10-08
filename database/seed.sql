-- ==========================================================================
-- HEAVY STORE TOP UP — Seed data (reference data)
-- Games (26), payment methods, settings, sample referrals.
-- Run AFTER schema.sql:  psql "$DATABASE_URL" -f database/seed.sql
-- ==========================================================================

-- --------------------------------------------------------------------------
-- GAMES (26)
-- --------------------------------------------------------------------------
INSERT INTO games (name, slug, category, publisher, logo_url, description, requires_server_id, server_id_label, sort_order) VALUES
('Free Fire',                    'free-fire',            'mobile',  'Garena',        '/assets/games/free-fire.svg',            'Top up Diamond Free Fire instan & aman.',            FALSE, 'Server ID', 1),
('Free Fire MAX',                'free-fire-max',        'mobile',  'Garena',        '/assets/games/free-fire-max.svg',        'Top up Diamond Free Fire MAX otomatis.',             FALSE, 'Server ID', 2),
('Mobile Legends',               'mobile-legends',       'mobile',  'Moonton',       '/assets/games/mobile-legends.svg',       'Top up Diamond Mobile Legends: Bang Bang.',          TRUE,  'Server ID', 3),
('Roblox',                       'roblox',               'pc',      'Roblox Corp.',  '/assets/games/roblox.svg',               'Beli Robux untuk Roblox.',                           FALSE, 'Username', 4),
('PUBG Mobile',                  'pubg-mobile',          'mobile',  'Tencent',       '/assets/games/pubg-mobile.svg',          'Top up UC PUBG Mobile.',                             FALSE, 'User ID', 5),
('PUBG PC',                      'pubg-pc',              'pc',      'Krafton',       '/assets/games/pubg-pc.svg',              'Top up G-Coin PUBG PC.',                             FALSE, 'Steam ID', 6),
('Valorant',                     'valorant',             'pc',      'Riot Games',    '/assets/games/valorant.svg',             'Top up Valorant Points (VP).',                       FALSE, 'Riot ID', 7),
('Counter-Strike 2',             'counter-strike-2',     'pc',      'Valve',         '/assets/games/counter-strike-2.svg',     'Top up Steam Wallet untuk CS2.',                     FALSE, 'Steam ID', 8),
('Dota 2',                       'dota-2',               'pc',      'Valve',         '/assets/games/dota-2.svg',               'Top up Steam Wallet untuk Dota 2.',                  FALSE, 'Steam ID', 9),
('Point Blank',                  'point-blank',          'pc',      'Zepetto',       '/assets/games/point-blank.svg',          'Top up PB Cash Point Blank.',                        FALSE, 'User ID', 10),
('Fortnite',                     'fortnite',             'pc',      'Epic Games',    '/assets/games/fortnite.svg',             'Top up V-Bucks Fortnite.',                           FALSE, 'Epic ID', 11),
('Honor of Kings',               'honor-of-kings',       'mobile',  'Tencent',       '/assets/games/honor-of-kings.svg',       'Top up Tokens Honor of Kings.',                      TRUE,  'Server ID', 12),
('Genshin Impact',               'genshin-impact',       'mobile',  'HoYoverse',     '/assets/games/genshin-impact.svg',       'Top up Genesis Crystals Genshin Impact.',            TRUE,  'Server', 13),
('Call of Duty Mobile',          'call-of-duty-mobile',  'mobile',  'Activision',    '/assets/games/call-of-duty-mobile.svg',  'Top up CP Call of Duty Mobile.',                     FALSE, 'User ID', 14),
('League of Legends',            'league-of-legends',    'pc',      'Riot Games',    '/assets/games/league-of-legends.svg',    'Top up Riot Points League of Legends.',              FALSE, 'Riot ID', 15),
('League of Legends: Wild Rift', 'wild-rift',            'mobile',  'Riot Games',    '/assets/games/wild-rift.svg',            'Top up Wild Cores Wild Rift.',                       FALSE, 'Riot ID', 16),
('Arena of Valor',               'arena-of-valor',       'mobile',  'Tencent',       '/assets/games/arena-of-valor.svg',       'Top up Vouchers Arena of Valor.',                    FALSE, 'User ID', 17),
('Clash of Clans',               'clash-of-clans',       'mobile',  'Supercell',     '/assets/games/clash-of-clans.svg',       'Top up Gems Clash of Clans.',                        FALSE, 'Player Tag', 18),
('Clash Royale',                 'clash-royale',         'mobile',  'Supercell',     '/assets/games/clash-royale.svg',         'Top up Gems Clash Royale.',                          FALSE, 'Player Tag', 19),
('EA SPORTS FC Mobile',          'ea-sports-fc-mobile',  'mobile',  'EA',            '/assets/games/ea-sports-fc-mobile.svg',  'Top up FC Points EA SPORTS FC Mobile.',              FALSE, 'User ID', 20),
('eFootball',                    'efootball',            'mobile',  'Konami',        '/assets/games/efootball.svg',            'Top up Coins eFootball.',                            FALSE, 'User ID', 21),
('Minecraft',                    'minecraft',            'pc',      'Mojang',        '/assets/games/minecraft.svg',            'Beli Minecoins / Java Edition.',                     FALSE, 'Username', 22),
('Steam Wallet',                 'steam-wallet',         'voucher', 'Valve',         '/assets/games/steam-wallet.svg',         'Top up Steam Wallet (kode voucher).',                FALSE, 'Steam ID', 23),
('PlayStation Store',            'playstation-store',    'voucher', 'Sony',          '/assets/games/playstation-store.svg',    'Voucher PlayStation Store (IDR).',                   FALSE, 'PSN ID', 24),
('Nintendo eShop',               'nintendo-eshop',       'voucher', 'Nintendo',      '/assets/games/nintendo-eshop.svg',       'Voucher Nintendo eShop.',                            FALSE, 'Nintendo ID', 25),
('Xbox/Microsoft Store',         'xbox-microsoft-store','voucher', 'Microsoft',     '/assets/games/xbox-microsoft-store.svg', 'Voucher Xbox / Microsoft Store.',                    FALSE, 'Xbox ID', 26)
ON CONFLICT (slug) DO NOTHING;

-- --------------------------------------------------------------------------
-- PAYMENT METHODS (Indonesia) — provider routing is server-side
-- --------------------------------------------------------------------------
INSERT INTO payment_methods (code, name, type, provider, logo_url, fee_flat, fee_percent, min_amount, max_amount, instructions, sort_order) VALUES
('qris',        'QRIS (Semua E-Wallet & M-Banking)', 'qris',          'midtrans', '/assets/pay/qris.svg',      0, 0.7, 1000, 0, 'Scan QRIS menggunakan aplikasi e-wallet atau m-banking apa pun.', 1),
('dana',        'DANA',                              'ewallet',       'dana',     '/assets/pay/dana.svg',      0, 1.5, 1000, 0, 'Buka aplikasi DANA, lalu setujui permintaan pembayaran.', 2),
('ovo',         'OVO',                               'ewallet',       'midtrans', '/assets/pay/ovo.svg',       0, 1.5, 1000, 0, 'Buka aplikasi OVO dan selesaikan pembayaran.', 3),
('gopay',       'GoPay',                             'ewallet',       'midtrans', '/assets/pay/gopay.svg',     0, 2.0, 1000, 0, 'Buka aplikasi Gojek, pilih GoPay dan bayar.', 4),
('shopeepay',   'ShopeePay',                         'ewallet',       'midtrans', '/assets/pay/shopeepay.svg', 0, 2.0, 1000, 0, 'Buka aplikasi Shopee, pilih ShopeePay dan bayar.', 5),
('bca_va',      'BCA Virtual Account',               'bank_transfer', 'midtrans', '/assets/pay/bca.svg',       4000, 0, 10000, 0, 'Bayar melalui m-BCA / ATM BCA ke nomor Virtual Account.', 6),
('bni_va',      'BNI Virtual Account',               'bank_transfer', 'midtrans', '/assets/pay/bni.svg',       4000, 0, 10000, 0, 'Bayar melalui BNI Mobile / ATM BNI ke nomor Virtual Account.', 7),
('bri_va',      'BRI Virtual Account',               'bank_transfer', 'midtrans', '/assets/pay/bri.svg',       4000, 0, 10000, 0, 'Bayar melalui BRImo / ATM BRI ke nomor Virtual Account.', 8),
('mandiri_va',  'Mandiri Virtual Account',           'bank_transfer', 'midtrans', '/assets/pay/mandiri.svg',   4000, 0, 10000, 0, 'Bayar melalui Livin'' / ATM Mandiri ke nomor Virtual Account.', 9),
('permata_va',  'Permata Virtual Account',           'bank_transfer', 'midtrans', '/assets/pay/permata.svg',   4000, 0, 10000, 0, 'Bayar melalui PermataMobile / ATM Permata ke nomor Virtual Account.', 10),
('cimb_va',     'CIMB Niaga Virtual Account',        'bank_transfer', 'midtrans', '/assets/pay/cimb.svg',      4000, 0, 10000, 0, 'Bayar melalui OCTO Mobile / ATM CIMB ke nomor Virtual Account.', 11),
('alfamart',    'Alfamart',                          'retail',        'midtrans', '/assets/pay/alfamart.svg',  5000, 0, 10000, 0, 'Bayar tunai di kasir Alfamart dengan kode pembayaran.', 12),
('indomaret',   'Indomaret',                         'retail',        'midtrans', '/assets/pay/indomaret.svg', 5000, 0, 10000, 0, 'Bayar tunai di kasir Indomaret dengan kode pembayaran.', 13)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------------------------
-- SETTINGS
-- --------------------------------------------------------------------------
INSERT INTO settings (key, value, type, description, is_public) VALUES
('site_name',                  '"HEAVY STORE TOP UP"',            'string',  'Nama situs', TRUE),
('site_tagline',               '"Top Up Game Cepat, Aman & Otomatis"', 'string', 'Tagline situs', TRUE),
('site_description',           '"HEAVY STORE TOP UP — platform top up game otomatis, aman, dan terpercaya di Indonesia."', 'string', 'Deskripsi meta', TRUE),
('contact_email',              '"support@heavyystore.topup.id"',   'string',  'Email kontak', TRUE),
('contact_whatsapp',           '""',                               'string',  'Nomor WhatsApp kontak', TRUE),
('maintenance_mode',           'false',                            'boolean', 'Mode maintenance global', TRUE),
('maintenance_message',        '"Kami sedang melakukan pemeliharaan. Silakan kembali beberapa saat lagi."', 'string', 'Pesan maintenance', TRUE),
('registration_enabled',       'true',                             'boolean', 'Izinkan registrasi customer', TRUE),
('referral_enabled',           'true',                             'boolean', 'Aktifkan sistem referral', TRUE),
('default_margin_type',        '"percent"',                        'string',  'Tipe margin default', FALSE),
('default_margin_value',       '8',                                'number',  'Nilai margin default (%)', FALSE),
('min_margin_percent',         '3',                                'number',  'Margin minimum agar tidak rugi (%)', FALSE),
('order_expiry_minutes',       '30',                               'number',  'Batas waktu pembayaran (menit)', TRUE),
('currency',                   '"IDR"',                            'string',  'Mata uang', TRUE),
('timezone',                   '"Asia/Jakarta"',                   'string',  'Zona waktu', TRUE),
('announcement',               '""',                               'string',  'Pengumuman banner', TRUE),
('notification_email_enabled', 'false',                            'boolean', 'Aktifkan notifikasi email', FALSE),
('notification_whatsapp_enabled', 'false',                         'boolean', 'Aktifkan notifikasi WhatsApp', FALSE)
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------------------
-- SAMPLE REFERRALS
-- --------------------------------------------------------------------------
INSERT INTO referrals (code, description, discount_type, discount_value, min_transaction, max_discount, usage_limit, is_active) VALUES
('HEAVY10',  'Diskon 10% maksimal Rp10.000', 'percent', 10, 0, 10000, 0, TRUE),
('NEWBIE5',  'Diskon Rp5.000 untuk transaksi min. Rp25.000', 'fixed', 5000, 25000, 5000, 0, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ==========================================================================
-- Products are seeded by `npm run db:seed` (scripts/db-seed.js) so that
-- supplier_cost / margin can be generated consistently and edited later
-- from the Admin Panel without touching code.
-- ==========================================================================
