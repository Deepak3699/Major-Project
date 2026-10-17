CREATE TABLE IF NOT EXISTS hr_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  -- UNIQUE here allows many NULLs; empty strings are normalised to NULL by
  -- migration 006 so a missing value can never satisfy an equality match.
  linkedin_url TEXT UNIQUE,
  personal_email TEXT,
  personal_mobile TEXT,
  current_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  confidence_score SMALLINT DEFAULT 0,
  contact_source TEXT,                    -- direct_extracted | search_discovered | osint_discovered | whois_discovered | provider_enriched | pattern_generated
  contact_method TEXT,                    -- how the contact was found (e.g., career_page_regex, ddg_dork, whois)
  contact_url TEXT,                       -- URL where the contact was found
  extraction_provenance JSONB,            -- full audit trail of extraction stages
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- A contact needs one real way to reach the person, unless retention has
  -- anonymised it (scheduler.enforce_retention blanks locators on purpose).
  -- COALESCE matters: `NULL jsonb ? key` is NULL and a NULL CHECK result passes.
  CONSTRAINT hr_contacts_has_locator CHECK (
    NULLIF(linkedin_url, '') IS NOT NULL
    OR NULLIF(personal_email, '') IS NOT NULL
    OR NULLIF(personal_mobile, '') IS NOT NULL
    OR COALESCE(extraction_provenance ? 'retained_anonymised_at', false)
  )
);
