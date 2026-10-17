-- Concern: INDEXES (audit_log, verification_log, enrichment_log).
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_verification_log_lead ON verification_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_lead ON enrichment_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_created ON enrichment_log(created_at DESC);
