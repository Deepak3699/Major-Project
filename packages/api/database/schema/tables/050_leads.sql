CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID UNIQUE REFERENCES job_postings(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  hr_contact_id UUID REFERENCES hr_contacts(id) ON DELETE SET NULL,
  lead_score SMALLINT DEFAULT 0,
  score_band TEXT GENERATED ALWAYS AS (
    CASE WHEN lead_score >= 70 THEN 'hot'
         WHEN lead_score >= 40 THEN 'warm'
         ELSE 'cold' END
  ) STORED,
  pipeline_stage TEXT DEFAULT 'discovered',
  legal_basis TEXT DEFAULT 'legitimate_interest_b2b',
  processing_purpose TEXT DEFAULT 'b2b_recruitment_outreach',
  provenance JSONB,
  data_quality TEXT DEFAULT 'complete',
  email_status TEXT,
  whatsapp_status TEXT,
  do_not_contact BOOLEAN DEFAULT false,
  possible_duplicate_of UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  hr_extraction_provenance JSONB,            -- SRS §4.5 provenance audit trail
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
