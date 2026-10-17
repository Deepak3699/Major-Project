import type { MigrationContext } from 'node-pg-migrate';

// Forward-only delta: enforce the lead lifecycle + verification-status
// vocabularies and add the suppression/outreach indexes. Idempotent
// (DROP-then-ADD / IF NOT EXISTS). Mirrors ../schema/constraints + indexes.
// NOTE: the DROP-then-ADD lets a legacy prod DB pick up the new pipeline_stage
// failure states without aborting on pre-existing rows (check_violation caught).

export const up = (pgm: MigrationContext) => {
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_chk;
      ALTER TABLE leads ADD CONSTRAINT leads_pipeline_stage_chk CHECK (pipeline_stage IN (
        'discovered','enriching','enriched','verifying','verified','drafted','contacted',
        'ready_for_outreach','message_generated','send_pending','sent','delivered','replied','converted','bounced',
        'enrichment_failed','verification_failed','contact_unavailable','suppressed','send_failed','provider_error','retry_pending'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_status_chk;
      ALTER TABLE leads ADD CONSTRAINT leads_email_status_chk CHECK (email_status IS NULL OR email_status IN (
        'unknown','valid','invalid','catch_all','disposable','expired','pending'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_whatsapp_status_chk;
      ALTER TABLE leads ADD CONSTRAINT leads_whatsapp_status_chk CHECK (whatsapp_status IS NULL OR whatsapp_status IN (
        'unknown','registered','not_registered','expired','pending'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_suppressions_contact ON suppressions(normalized_contact)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_outreach_log_lead_channel_time ON outreach_log(lead_id, channel, sent_at DESC)`);
  // statement-level TRUNCATE guard too (row trigger doesn't catch TRUNCATE)
  pgm.sql(`CREATE OR REPLACE FUNCTION forbid_audit_truncate() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only: TRUNCATE is not permitted'; END; $$ LANGUAGE plpgsql`);
  pgm.sql(`
    DO $$ BEGIN
      DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_log;
      CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_truncate();
    END $$;
  `);
  // append-only audit trail (compliance evidence must be tamper-evident)
  pgm.sql(`CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP; END; $$ LANGUAGE plpgsql`);
  pgm.sql(`
    DO $$ BEGIN
      DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
      CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
    END $$;
  `);
};

export const down = (pgm: MigrationContext) => {
  pgm.sql(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_whatsapp_status_chk`);
  pgm.sql(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_status_chk`);
  pgm.sql(`ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_chk`);
  pgm.sql(`DROP INDEX IF EXISTS idx_outreach_log_lead_channel_time`);
  pgm.sql(`DROP INDEX IF EXISTS idx_suppressions_contact`);
};
