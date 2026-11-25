import type { MigrationContext } from 'node-pg-migrate';

// Conversation-driven interviews: the end-of-round report, the webcam
// presentation review, and the language the candidate answered in.
// Mirrors database/schema/tables/190_ai_practice.sql. Additive only.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS report JSONB NOT NULL DEFAULT 'null'::jsonb,
      ADD COLUMN IF NOT EXISTS presentation JSONB NOT NULL DEFAULT 'null'::jsonb;

    ALTER TABLE interview_questions
      ADD COLUMN IF NOT EXISTS answer_language TEXT NOT NULL DEFAULT 'english';

    CREATE INDEX IF NOT EXISTS idx_interview_sessions_status_completed
      ON interview_sessions (status, completed_at DESC);
  `);
};

// Rollback-only. Normal startup never runs this.
export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`
    DROP INDEX IF EXISTS idx_interview_sessions_status_completed;
    ALTER TABLE interview_questions DROP COLUMN IF EXISTS answer_language;
    ALTER TABLE interview_sessions
      DROP COLUMN IF EXISTS presentation,
      DROP COLUMN IF EXISTS report;
  `);
};
