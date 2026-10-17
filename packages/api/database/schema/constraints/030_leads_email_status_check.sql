-- Discovery and verification are distinct: email_status records an actual
-- verification outcome (or pending/unknown), never a guessed "verified".
DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_status_chk;
  ALTER TABLE leads ADD CONSTRAINT leads_email_status_chk CHECK (email_status IS NULL OR email_status IN (
    'unknown','valid','invalid','catch_all','disposable','expired','pending'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
