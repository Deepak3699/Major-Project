-- Concern: INDEXES (fuzzy search). The leads list `filter` runs ILIKE '%term%'
-- across company name/domain and job title. A plain btree can't serve a leading
-- wildcard; GIN + pg_trgm can. Requires the pg_trgm extension (schema/tables/000).
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_domain_trgm ON companies USING gin (domain gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobposting_title_trgm ON job_postings USING gin (title gin_trgm_ops);
-- Contacts page searches hr name/email with ILIKE '%term%': same treatment.
CREATE INDEX IF NOT EXISTS idx_hrcontacts_name_trgm ON hr_contacts USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hrcontacts_email_trgm ON hr_contacts USING gin (personal_email gin_trgm_ops);

-- HR contact reuse is scoped per employer (migration 006): one company must not
-- hold two rows for the same email or LinkedIn profile. Global uniqueness on
-- linkedin_url alone is still enforced by the table constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hrcontacts_company_email
  ON hr_contacts (current_company_id, lower(personal_email))
  WHERE personal_email IS NOT NULL AND personal_email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hrcontacts_company_linkedin
  ON hr_contacts (current_company_id, linkedin_url)
  WHERE linkedin_url IS NOT NULL AND linkedin_url <> '';
