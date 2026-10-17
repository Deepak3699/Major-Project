-- Attach the lifecycle guard (function lives in schema/functions/).
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_leads_stage_transition ON leads;
  CREATE TRIGGER trg_leads_stage_transition
    BEFORE UPDATE OF pipeline_stage ON leads
    FOR EACH ROW EXECUTE FUNCTION enforce_leads_stage_transition();
END $$;
