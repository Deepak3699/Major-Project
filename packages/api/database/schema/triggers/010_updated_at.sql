-- Concern: TRIGGERS.
-- Attach set_updated_at() to every table that carries an updated_at column so
-- the freshness timestamp is always current. DROP-then-CREATE keeps idempotent.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','hr_contacts','users','leads','settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END $$;
