import type { MigrationContext } from 'node-pg-migrate';

// Voluntary placement outcomes and server-side onboarding progress. Mirrors
// database/schema/tables/210_engagement.sql. Additive only.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    CREATE TABLE IF NOT EXISTS placement_outcomes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
      job_posting_id UUID REFERENCES job_postings(id) ON DELETE SET NULL,
      company_name TEXT NOT NULL DEFAULT '',
      role_title TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL CHECK (outcome IN ('offer_received', 'joined')),
      joined_on DATE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS placement_outcomes_user_idx
      ON placement_outcomes (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS placement_outcomes_created_idx
      ON placement_outcomes (created_at DESC);

    CREATE TABLE IF NOT EXISTS onboarding_progress (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(completed_steps) = 'array'),
      last_step SMALLINT NOT NULL DEFAULT 0 CHECK (last_step >= 0),
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      skipped BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
};

// Rollback-only. Normal startup never runs this.
export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`
    DROP TABLE IF EXISTS onboarding_progress CASCADE;
    DROP TABLE IF EXISTS placement_outcomes CASCADE;
  `);
};
