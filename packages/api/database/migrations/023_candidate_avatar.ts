import type { MigrationContext } from 'node-pg-migrate';

// Candidate identity: a built-in cartoon avatar (avatar_id) or an uploaded
// square photo stored as a small data URL (avatar_url). Idempotent so the
// declarative schema and an existing deployment converge.
export const up = async (pgm: MigrationContext) => {
  pgm.sql(`
    ALTER TABLE candidate_profiles
      ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'ember';
    ALTER TABLE candidate_profiles
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);
};

export const down = async (pgm: MigrationContext) => {
  pgm.sql(`
    ALTER TABLE candidate_profiles DROP COLUMN IF EXISTS avatar_url;
    ALTER TABLE candidate_profiles DROP COLUMN IF EXISTS avatar_id;
  `);
};
