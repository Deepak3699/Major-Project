import type { MigrationContext } from 'node-pg-migrate';
import * as fs from 'fs';
import * as path from 'path';

// Forward-only delta: lifecycle transition machine + legal-basis columns.
// Mirrors schema/functions/020_leads_stage_transition.sql,
// schema/triggers/030_leads_stage_transition.sql and tables/050_leads.sql.
// Idempotent: safe to re-run.

function load(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'schema', rel), 'utf8');
}

export const up = (pgm: MigrationContext) => {
  pgm.sql(load('functions/020_leads_stage_transition.sql'));
  pgm.sql(load('triggers/030_leads_stage_transition.sql'));
  pgm.sql(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS legal_basis TEXT DEFAULT 'legitimate_interest_b2b'`);
  pgm.sql(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS processing_purpose TEXT DEFAULT 'b2b_recruitment_outreach'`);
  pgm.sql(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS provenance JSONB`);
};

export const down = (pgm: MigrationContext) => {
  pgm.sql(`DROP TRIGGER IF EXISTS trg_leads_stage_transition ON leads`);
  pgm.sql(`DROP FUNCTION IF EXISTS enforce_leads_stage_transition()`);
  pgm.sql(`DROP FUNCTION IF EXISTS leads_stage_transition_ok(TEXT, TEXT)`);
  pgm.sql(`ALTER TABLE leads DROP COLUMN IF EXISTS provenance`);
  pgm.sql(`ALTER TABLE leads DROP COLUMN IF EXISTS processing_purpose`);
  pgm.sql(`ALTER TABLE leads DROP COLUMN IF EXISTS legal_basis`);
};
