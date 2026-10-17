import type { MigrationContext } from 'node-pg-migrate';

// Forward-only delta for an ALREADY-DEPLOYED production DB (a fresh DB gets
// these from ../schema/tables). Idempotent so re-running / converging is safe.
// Concern: TABLE. Global do-not-contact store (send worker + webhook + admin).

export const up = (pgm: MigrationContext) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS suppressions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      normalized_contact TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'any',
      reason TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (normalized_contact, channel)
    )
  `);
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS outreach_tokens (
      token TEXT PRIMARY KEY,
      normalized_contact TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS daily_runs (
      run_date DATE PRIMARY KEY,
      started_at TIMESTAMPTZ DEFAULT now(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running',
      leads_found INT DEFAULT 0
    )
  `);
};

export const down = (pgm: MigrationContext) => {
  pgm.sql(`DROP TABLE IF EXISTS daily_runs`);
  pgm.sql(`DROP TABLE IF EXISTS suppressions`);
};
