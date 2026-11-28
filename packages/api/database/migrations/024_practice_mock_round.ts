import type { MigrationContext } from 'node-pg-migrate';

// One free lifetime mock round per candidate. Pro accounts are not gated, so
// the usage row is only a record of the free attempt.
export const up = async (pgm: MigrationContext) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practice_mock_rounds (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      session_id UUID
    );
  `);
};

export const down = async (pgm: MigrationContext) => {
  pgm.sql(`DROP TABLE IF EXISTS practice_mock_rounds;`);
};
