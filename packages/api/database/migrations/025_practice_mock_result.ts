import type { MigrationContext } from 'node-pg-migrate';

// Persist the outcome of a completed mock round so the candidate can review it
// and replay the round from the practice workspace.
export const up = async (pgm: MigrationContext) => {
  pgm.sql(`
    ALTER TABLE practice_mock_rounds
      ADD COLUMN IF NOT EXISTS result JSONB,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
  `);
};

export const down = async (pgm: MigrationContext) => {
  pgm.sql(`
    ALTER TABLE practice_mock_rounds
      DROP COLUMN IF EXISTS result,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS attempts;
  `);
};
