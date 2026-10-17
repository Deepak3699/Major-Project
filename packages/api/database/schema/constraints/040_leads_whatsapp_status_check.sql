DO $$ BEGIN
  ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_whatsapp_status_chk;
  ALTER TABLE leads ADD CONSTRAINT leads_whatsapp_status_chk CHECK (whatsapp_status IS NULL OR whatsapp_status IN (
    'unknown','registered','not_registered','expired','pending'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
