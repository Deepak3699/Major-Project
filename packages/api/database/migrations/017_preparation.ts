import type { MigrationContext } from 'node-pg-migrate';

// Job-specific preparation artifacts. Mirrors
// database/schema/tables/220_preparation.sql. Additive only.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    CREATE TABLE IF NOT EXISTS preparation_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id UUID REFERENCES job_postings(id) ON DELETE SET NULL,
      module TEXT NOT NULL CHECK (module IN ('interview_prep', 'group_discussion', 'presentation', 'company_research')),
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'ready', 'failed')),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
      sources JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
      model TEXT NOT NULL DEFAULT 'template',
      credits_charged INTEGER NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
      error TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS preparation_artifacts_user_idx
      ON preparation_artifacts (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS preparation_artifacts_job_idx
      ON preparation_artifacts (job_id, module, created_at DESC);
  `);
};

// Rollback-only. Normal startup never runs this.
export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`DROP TABLE IF EXISTS preparation_artifacts CASCADE;`);
};
