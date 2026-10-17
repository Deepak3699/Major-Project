import type { MigrationContext } from 'node-pg-migrate';

// Forward-only delta: immutable-raw-snapshot versioning on job_postings
// (Track 3). Mirrors schema/tables/040_job_postings.sql. Idempotent.
export const up = (pgm: MigrationContext) => {
  pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS parser_version TEXT`);
  pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS content_hash TEXT`);
};

export const down = (pgm: MigrationContext) => {
  pgm.sql(`ALTER TABLE job_postings DROP COLUMN IF EXISTS content_hash`);
  pgm.sql(`ALTER TABLE job_postings DROP COLUMN IF EXISTS parser_version`);
};
