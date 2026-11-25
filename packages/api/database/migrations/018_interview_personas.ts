import type { MigrationContext } from 'node-pg-migrate';

// Persona-aware interviews: the chosen avatar, the specific job being
// practised for, and the spoken opening / reaction lines. Mirrors
// database/schema/tables/190_ai_practice.sql. Additive only, so existing
// sessions keep working and fall back to the default interviewer.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'aria',
      ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES job_postings(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS job_title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS job_company TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS opening_line TEXT NOT NULL DEFAULT '';

    ALTER TABLE interview_questions
      ADD COLUMN IF NOT EXISTS interviewer_reply TEXT NOT NULL DEFAULT '';

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_avatar
      ON interview_sessions (user_id, avatar_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_job
      ON interview_sessions (job_id, started_at DESC);
  `);
};

// Rollback-only. Normal startup never runs this.
export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`
    DROP INDEX IF EXISTS idx_interview_sessions_job;
    DROP INDEX IF EXISTS idx_interview_sessions_avatar;
    ALTER TABLE interview_questions DROP COLUMN IF EXISTS interviewer_reply;
    ALTER TABLE interview_sessions
      DROP COLUMN IF EXISTS opening_line,
      DROP COLUMN IF EXISTS job_company,
      DROP COLUMN IF EXISTS job_title,
      DROP COLUMN IF EXISTS job_id,
      DROP COLUMN IF EXISTS avatar_id;
  `);
};
