-- Plans, candidate subscriptions and the credit wallet/ledger foundation.
-- Additive only: no existing table is altered except the users role check,
-- which keeps the legacy candidate role while adding the brief's USER role.
--
-- Business rules encoded here:
--   * FREE plan costs 0 and carries exactly 2 initial preparation credits.
--   * Paid-plan credit quantities are deliberately NULL (owner-configurable);
--     the coding agent must not invent them.
--   * Every balance mutation is a ledger row; balances can never go negative.

CREATE TABLE IF NOT EXISTS plan_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  credits_included INTEGER CHECK (credits_included IS NULL OR credits_included >= 0),
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plan_catalog (code, name, price_paise, currency, credits_included, features, sort_order)
VALUES
  ('FREE', 'Free', 0, 'INR', 2, '["Discover jobs", "2 initial preparation credits", "Limited practice quota"]'::jsonb, 0),
  ('CLASSIC', 'Classic', 19900, 'INR', NULL, '[]'::jsonb, 1),
  ('CLASSIC_PLUS', 'Classic Plus', 49900, 'INR', NULL, '[]'::jsonb, 2),
  ('BRO', 'BRO', 79900, 'INR', NULL, '[]'::jsonb, 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS candidate_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'FREE' REFERENCES plan_catalog(code),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'cancelled', 'expired')),
  source TEXT NOT NULL DEFAULT 'system',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_granted INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_granted >= 0),
  lifetime_used INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('signup_grant', 'purchase', 'consumption', 'refund', 'admin_adjustment', 'expiry')),
  reason TEXT NOT NULL DEFAULT '',
  ref_type TEXT,
  ref_id TEXT,
  idempotency_key TEXT UNIQUE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one signup grant per user, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_signup_once
  ON credit_ledger (user_id) WHERE kind = 'signup_grant';
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_kind_created_idx
  ON credit_ledger (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_subscriptions_plan_idx
  ON candidate_subscriptions (plan_code, status);
CREATE INDEX IF NOT EXISTS credit_wallets_updated_idx
  ON credit_wallets (updated_at DESC);

-- USER is the brief's security role; candidate remains for existing accounts.
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'sales_rep', 'viewer', 'candidate', 'user'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
