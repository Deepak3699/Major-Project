import type { MigrationContext } from 'node-pg-migrate';

// Forward-only delta: trigram indexes for the contacts search (Track 4).
// Mirrors schema/indexes/070_trgm_search.sql. Idempotent.
export const up = (pgm: MigrationContext) => {
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_hrcontacts_name_trgm ON hr_contacts USING gin (full_name gin_trgm_ops)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_hrcontacts_email_trgm ON hr_contacts USING gin (personal_email gin_trgm_ops)`);
};

export const down = (pgm: MigrationContext) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_hrcontacts_email_trgm`);
  pgm.sql(`DROP INDEX IF EXISTS idx_hrcontacts_name_trgm`);
};
