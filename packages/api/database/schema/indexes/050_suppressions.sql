-- Concern: INDEXES (suppressions). The server-side suppression check runs on
-- EVERY outbound message keyed by normalized_contact -> must be a unique scan.
CREATE INDEX IF NOT EXISTS idx_suppressions_contact ON suppressions(normalized_contact);
