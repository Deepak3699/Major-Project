-- Concern: TRIGGERS (data-integrity / compliance).
-- The audit trail must be append-only so it is trustworthy evidence for
-- compliance review. Any UPDATE or DELETE on audit_log is rejected at the
-- storage layer (independent of app logic). INSERT and SELECT are unaffected,
-- so normal logging + the admin audit viewer keep working.
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
  CREATE TRIGGER trg_audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
END $$;
