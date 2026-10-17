DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'sales_rep', 'viewer'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
