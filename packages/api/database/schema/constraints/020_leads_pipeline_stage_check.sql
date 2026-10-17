-- Lead lifecycle state machine (happy path + every failure state the spec lists).
-- NOTE: 'contacted' is the legacy alias of 'sent' still written by workers/webhooks.
DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_pipeline_stage_chk;
  ALTER TABLE leads ADD CONSTRAINT leads_pipeline_stage_chk CHECK (pipeline_stage IN (
    'discovered','enriching','enriched','verifying','verified','drafted','contacted',
    'ready_for_outreach','message_generated','send_pending','sent','delivered','replied','converted','bounced',
    'enrichment_failed','verification_failed','contact_unavailable','suppressed','send_failed','provider_error','retry_pending'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
