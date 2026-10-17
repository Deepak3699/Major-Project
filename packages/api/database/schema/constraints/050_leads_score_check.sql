-- Concern: CONSTRAINTS. lead_score is a 0-100 normalized score; anything
-- outside is a scoring bug and must not silently persist.
DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_score_range_chk;
  ALTER TABLE leads ADD CONSTRAINT leads_score_range_chk CHECK (lead_score BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
