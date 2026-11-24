import type { MigrationContext } from 'node-pg-migrate';

// Candidate plans, wallets and the credit ledger. Mirrors
// database/schema/tables/200_candidate_credits.sql so both runners land the
// same objects. Additive only: no existing row is rewritten.
//
// Business rules:
//  - FREE is ₹0 and every eligible new user receives exactly 2 credits once.
//  - Paid-plan credit quantities stay NULL until the owner configures them.
//  - One signup grant per user is enforced by a partial unique index.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
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

    -- USER is the brief's security role; candidate stays for existing accounts.
    DO $$ BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'sales_rep', 'viewer', 'candidate', 'user'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
  `);
};

// Rollback-only. Normal startup never runs this, and it never touches user
// records or existing ledger history outside these new tables.
export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`
    DROP TABLE IF EXISTS credit_ledger CASCADE;
    DROP TABLE IF EXISTS credit_wallets CASCADE;
    DROP TABLE IF EXISTS candidate_subscriptions CASCADE;
    DROP TABLE IF EXISTS plan_catalog CASCADE;
    DO $$ BEGIN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'sales_rep', 'viewer', 'candidate'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
  `);
};
