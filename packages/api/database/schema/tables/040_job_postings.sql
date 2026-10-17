CREATE TABLE IF NOT EXISTS job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  hr_contact_id UUID REFERENCES hr_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  experience_level TEXT,
  salary_range TEXT,
  job_url TEXT NOT NULL,
  source_site TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  raw_payload JSONB,
  parser_version TEXT,
  content_hash TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);
