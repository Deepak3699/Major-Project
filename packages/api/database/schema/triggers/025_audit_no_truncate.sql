-- Concern: TRIGGERS (compliance evidence integrity).
-- Complement to the row-level UPDATE/DELETE guard: the BEFORE UPDATE/DELETE row
-- trigger does NOT fire on TRUNCATE, so block that at the statement level too.
-- (True tamper-evidence ALSO requires the app connect as a non-owner role with
-- only INSERT/SELECT on audit_log — that's a deployment concern, see README.)
CREATE OR REPLACE FUNCTION forbid_audit_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: TRUNCATE is not permitted';
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON audit_log;
  CREATE TRIGGER trg_audit_log_no_truncate
    BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION forbid_audit_truncate();
END $$;
