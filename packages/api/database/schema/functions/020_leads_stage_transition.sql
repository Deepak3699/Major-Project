-- Legal lifecycle transitions. Same semantics as src/utils/lifecycle.ts (keep in sync).
--
-- Design: stages are PROGRESS markers, and writers (workers, webhooks, API) jump
-- straight to the outcome stage without persisting every intermediate step
-- (e.g. discovered -> verified, discovered -> contacted). Fabricating
-- intermediate history just to satisfy an adjacency map would be lying, so the
-- machine is DIRECTIONAL, not adjacent:
--   * any FORWARD jump along the happy path is legal (progress never corrupts);
--   * BACKWARD jumps are illegal (sent -> drafted, contacted -> discovered, ...);
--   * failure states are only enterable from the stages that can produce them;
--   * recovery exits only to retry/re-entry stages (or direct re-success);
--   * suppressed / converted are terminal (no exits — unsuppress is an explicit
--     admin action that resets via app code, never a silent jump).
-- The actual GATES (verified contact before send, suppression before send) are
-- enforced separately at send time, where they belong.
CREATE OR REPLACE FUNCTION leads_stage_rank(stage TEXT)
RETURNS INTEGER AS $$
BEGIN
  CASE stage
    WHEN 'discovered' THEN RETURN 0;
    WHEN 'enriching' THEN RETURN 1;
    WHEN 'enriched' THEN RETURN 2;
    WHEN 'verifying' THEN RETURN 3;
    WHEN 'verified' THEN RETURN 4;
    WHEN 'ready_for_outreach' THEN RETURN 5;
    WHEN 'message_generated' THEN RETURN 6;
    WHEN 'drafted' THEN RETURN 7;
    WHEN 'send_pending' THEN RETURN 8;
    WHEN 'sent' THEN RETURN 9;
    WHEN 'contacted' THEN RETURN 9;
    WHEN 'delivered' THEN RETURN 10;
    WHEN 'replied' THEN RETURN 11;
    WHEN 'converted' THEN RETURN 12;
    ELSE RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION leads_stage_transition_ok(old_stage TEXT, new_stage TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  old_rank INTEGER := leads_stage_rank(old_stage);
  new_rank INTEGER := leads_stage_rank(new_stage);
BEGIN
  IF old_stage = new_stage THEN RETURN TRUE; END IF;
  -- Terminal states: no exits.
  IF old_stage IN ('suppressed', 'converted') THEN RETURN FALSE; END IF;
  -- Suppression reachable from anywhere live.
  IF new_stage = 'suppressed' THEN RETURN TRUE; END IF;
  -- Happy path: forward only.
  IF old_rank IS NOT NULL AND new_rank IS NOT NULL THEN
    RETURN new_rank > old_rank;
  END IF;
  -- Entering a failure state: only from stages that can produce it.
  IF new_stage = 'enrichment_failed' THEN
    RETURN old_stage IN ('discovered', 'enriching');
  END IF;
  IF new_stage = 'verification_failed' THEN
    RETURN old_stage IN ('enriched', 'verifying');
  END IF;
  IF new_stage = 'contact_unavailable' THEN
    RETURN old_stage IN ('discovered', 'enriching', 'enriched', 'verifying');
  END IF;
  IF new_stage IN ('send_failed', 'provider_error') THEN
    RETURN old_stage IN ('verified', 'ready_for_outreach', 'message_generated', 'drafted', 'send_pending');
  END IF;
  IF new_stage = 'bounced' THEN
    RETURN old_stage IN ('sent', 'contacted', 'delivered');
  END IF;
  IF new_stage = 'retry_pending' THEN
    RETURN old_stage IN ('bounced', 'send_failed', 'provider_error', 'verification_failed',
                         'enrichment_failed', 'drafted', 'send_pending');
  END IF;
  -- Recovery exits from failure states (re-entry or direct re-success).
  IF old_stage = 'enrichment_failed' THEN
    RETURN new_stage IN ('enriching', 'enriched', 'retry_pending');
  END IF;
  IF old_stage = 'verification_failed' THEN
    RETURN new_stage IN ('verifying', 'verified', 'retry_pending');
  END IF;
  IF old_stage = 'contact_unavailable' THEN
    RETURN new_stage IN ('enriching', 'enriched');
  END IF;
  IF old_stage IN ('send_failed', 'provider_error') THEN
    RETURN new_stage IN ('retry_pending', 'send_pending', 'drafted');
  END IF;
  IF old_stage = 'bounced' THEN
    RETURN new_stage IN ('retry_pending');
  END IF;
  IF old_stage = 'retry_pending' THEN
    RETURN new_stage IN ('enriching', 'enriched', 'verifying', 'verified', 'drafted', 'send_pending');
  END IF;
  -- Failure -> happy direct jump not listed above (e.g. send_failed -> sent) is illegal.
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Enforcement trigger: impossible transitions raise instead of corrupting state.
CREATE OR REPLACE FUNCTION enforce_leads_stage_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage
     AND NOT leads_stage_transition_ok(OLD.pipeline_stage, NEW.pipeline_stage) THEN
    RAISE EXCEPTION 'illegal lead stage transition: % -> %', OLD.pipeline_stage, NEW.pipeline_stage;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
