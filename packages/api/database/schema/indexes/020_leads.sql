-- Concern: INDEXES (leads). Each matches a concrete query in routes/leads.ts +
-- routes/dashboard.ts (RBAC list, stage funnel, score band + sort, contactability).
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score_band ON leads(score_band, lead_score DESC);
-- RBAC: sales_rep listing filters assigned_to then sorts by the requested column.
CREATE INDEX IF NOT EXISTS idx_leads_assigned_created ON leads(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_score ON leads(assigned_to, lead_score DESC);
-- Do-not-contact filtering (hot path on the send guard + list default view).
-- FKs from leads (Postgres does NOT auto-index referencing side of FKs).
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_hr_contact ON leads(hr_contact_id);
