-- ==========================================================================
-- HEAVY STORE TOP UP — PostgreSQL Schema
-- Production-ready: FK, indexes, unique constraints, timestamps, triggers.
-- Run:  psql "$DATABASE_URL" -f database/schema.sql
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- updated_at trigger helper
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- ADMINS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS admins (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin','admin','operator')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (lower(email));
DROP TRIGGER IF EXISTS trg_admins_updated ON admins;
CREATE TRIGGER trg_admins_updated BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- USERS (customers)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,          -- this user's own code to share
  referred_by   TEXT,                          -- code used at registration
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- SUPPLIERS (top-up providers)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,          -- adapter code: digiflazz | vipreseller | generic
  api_url       TEXT,
  api_key       TEXT,                          -- encrypted at rest via app layer
  username      TEXT,
  secret        TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'DISCONNECTED'
                CHECK (status IN ('CONNECTED','DISCONNECTED','ERROR')),
  last_check_at TIMESTAMPTZ,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- GAMES
-- ==========================================================================
CREATE TABLE IF NOT EXISTS games (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL DEFAULT 'mobile'
                   CHECK (category IN ('mobile','pc','console','voucher','other')),
  publisher        TEXT,
  logo_url         TEXT,
  banner_url       TEXT,
  description      TEXT,
  requires_server_id BOOLEAN NOT NULL DEFAULT FALSE,
  server_id_label  TEXT DEFAULT 'Server ID',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  is_maintenance   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_games_active ON games (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_games_category ON games (category);
DROP TRIGGER IF EXISTS trg_games_updated ON games;
CREATE TRIGGER trg_games_updated BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- PRODUCTS (denominations / SKUs)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS products (
  id              BIGSERIAL PRIMARY KEY,
  game_id         BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  supplier_id     BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  denomination    TEXT,
  supplier_code   TEXT,                        -- SKU code at the supplier
  supplier_cost   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (supplier_cost >= 0),
  selling_price   NUMERIC(14,2),               -- manual override (optional)
  margin_type     TEXT NOT NULL DEFAULT 'percent' CHECK (margin_type IN ('percent','fixed')),
  margin_value    NUMERIC(14,2) NOT NULL DEFAULT 5,
  min_price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_discount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  promo_price     NUMERIC(14,2),               -- explicit promo price (optional)
  is_promo        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_maintenance  BOOLEAN NOT NULL DEFAULT FALSE,
  stock           INTEGER,                     -- NULL = unlimited
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_game ON products (game_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products (supplier_id);
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- PAYMENT METHODS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id           BIGSERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,           -- e.g. qris, bca_va, dana, ovo
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('ewallet','bank_transfer','qris','retail','other')),
  provider     TEXT NOT NULL DEFAULT 'midtrans',
  logo_url     TEXT,
  fee_flat     NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 0 = unlimited
  instructions TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods (is_active, sort_order);
DROP TRIGGER IF EXISTS trg_payment_methods_updated ON payment_methods;
CREATE TRIGGER trg_payment_methods_updated BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- REFERRALS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS referrals (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  discount_type   TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_transaction NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_discount    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 0 = no cap
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  usage_limit     INTEGER NOT NULL DEFAULT 0,        -- 0 = unlimited
  used_count      INTEGER NOT NULL DEFAULT 0,
  user_id         BIGINT REFERENCES users(id) ON DELETE CASCADE,  -- optional: specific user
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_active ON referrals (is_active, code);
DROP TRIGGER IF EXISTS trg_referrals_updated ON referrals;
CREATE TRIGGER trg_referrals_updated BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- ORDERS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                 BIGSERIAL PRIMARY KEY,
  order_id           TEXT NOT NULL UNIQUE,      -- public id: HVY-YYYYMMDD-XXXXXX
  user_id            BIGINT REFERENCES users(id) ON DELETE SET NULL,
  game_id            BIGINT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  product_id         BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id        BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,

  game_user_id       TEXT NOT NULL,
  game_server_id     TEXT,
  game_nickname      TEXT,

  product_name       TEXT NOT NULL,
  denomination       TEXT,

  supplier_cost      NUMERIC(14,2) NOT NULL DEFAULT 0,
  base_price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  promo_discount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  referral_code      TEXT,
  referral_discount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price        NUMERIC(14,2) NOT NULL DEFAULT 0,   -- product price after discount
  payment_fee        NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total        NUMERIC(14,2) NOT NULL DEFAULT 0,   -- total_price + fee

  payment_method     TEXT,
  payment_provider   TEXT,
  payment_reference  TEXT,
  payment_status     TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (payment_status IN ('PENDING','PAID','EXPIRED','FAILED','REFUNDED')),
  topup_status       TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (topup_status IN ('PENDING','PROCESSING','SUCCESS','FAILED','REFUNDED')),
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','PAID','PROCESSING','SUCCESS','FAILED','REFUNDED','EXPIRED','CANCELLED')),

  supplier_reference TEXT UNIQUE,
  idempotency_key    TEXT UNIQUE,

  customer_email     TEXT,
  customer_phone     TEXT,
  notes              TEXT,

  expires_at         TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  processed_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_topup_status ON orders (topup_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders (expires_at) WHERE status = 'PENDING';
DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- PAYMENTS (one row per gateway transaction attempt)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                 BIGSERIAL PRIMARY KEY,
  order_pk           BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_id           TEXT NOT NULL,
  provider           TEXT NOT NULL,
  provider_reference TEXT,
  method             TEXT,
  amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  fee                NUMERIC(14,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','PAID','EXPIRED','FAILED','REFUNDED')),
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  raw_response       JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_pk);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_ref
  ON payments (provider, provider_reference) WHERE provider_reference IS NOT NULL;
DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- REFERRAL USAGES
-- ==========================================================================
CREATE TABLE IF NOT EXISTS referral_usages (
  id              BIGSERIAL PRIMARY KEY,
  referral_id     BIGINT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  order_pk        BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  order_id        TEXT,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_usages_referral ON referral_usages (referral_id);
CREATE INDEX IF NOT EXISTS idx_referral_usages_user ON referral_usages (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_usage_order
  ON referral_usages (order_pk) WHERE order_pk IS NOT NULL;

-- ==========================================================================
-- NOTIFICATIONS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  order_pk   BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  order_id   TEXT,
  type       TEXT NOT NULL,                    -- order_created, payment_paid, ...
  title      TEXT NOT NULL,
  message    TEXT,
  channel    TEXT NOT NULL DEFAULT 'inapp',    -- inapp | email | whatsapp
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_order ON notifications (order_pk);

-- ==========================================================================
-- SETTINGS (key/value store, JSONB value)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS settings (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  value       JSONB,
  type        TEXT NOT NULL DEFAULT 'string',
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================================================
-- WEBHOOK LOGS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id                BIGSERIAL PRIMARY KEY,
  source            TEXT NOT NULL,             -- payment | supplier
  event             TEXT,
  reference         TEXT,
  signature_valid   BOOLEAN NOT NULL DEFAULT FALSE,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  error             TEXT,
  payload           JSONB,
  ip                TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_ref ON webhook_logs (reference);

-- ==========================================================================
-- AUDIT LOGS
-- ==========================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_type  TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('admin','user','system')),
  actor_id    BIGINT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- ==========================================================================
-- RATE LIMITS (DB-backed, survives serverless cold starts)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id           BIGSERIAL PRIMARY KEY,
  bucket       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- ==========================================================================
-- Done.
-- ==========================================================================
