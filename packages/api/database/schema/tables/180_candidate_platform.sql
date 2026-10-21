-- Candidate-facing job intelligence, recommendations and application tracking.
-- This layer reuses the existing companies/job_postings ingestion foundation.

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trust_score SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trust_band TEXT NOT NULL DEFAULT 'review',
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS india_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS job_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  source_site TEXT NOT NULL,
  source_job_id TEXT,
  source_url TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_posting_id, source_site, source_url)
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  contact_email TEXT,
  phone TEXT,
  location TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  skills TEXT[] NOT NULL DEFAULT '{}',
  preferred_roles TEXT[] NOT NULL DEFAULT '{}',
  preferred_locations TEXT[] NOT NULL DEFAULT '{}',
  remote_preference TEXT NOT NULL DEFAULT 'any',
  experience_years NUMERIC(4,1) NOT NULL DEFAULT 0,
  education_level TEXT NOT NULL DEFAULT '',
  salary_min NUMERIC(12,2),
  salary_currency TEXT NOT NULL DEFAULT 'INR',
  experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications TEXT[] NOT NULL DEFAULT '{}',
  resume_filename TEXT,
  profile_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  match_score SMALLINT NOT NULL DEFAULT 0,
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills TEXT[] NOT NULL DEFAULT '{}',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_posting_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'SAVED',
  notes TEXT NOT NULL DEFAULT '',
  applied_at TIMESTAMPTZ,
  outcome_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_posting_id)
);

CREATE TABLE IF NOT EXISTS application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  verifier_id UUID REFERENCES users(id) ON DELETE SET NULL,
  trust_score SMALLINT NOT NULL,
  trust_band TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL,
  feedback TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidate_profiles_skills_gin_idx ON candidate_profiles USING GIN (skills);
CREATE INDEX IF NOT EXISTS job_postings_candidate_feed_idx ON job_postings (review_status, is_active, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS job_postings_india_feed_idx ON job_postings (india_confirmed, review_status, is_active, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS job_postings_skills_gin_idx ON job_postings USING GIN (skills);
CREATE INDEX IF NOT EXISTS job_sources_job_idx ON job_sources (job_posting_id, source_site);
CREATE INDEX IF NOT EXISTS job_recommendations_user_score_idx ON job_recommendations (user_id, match_score DESC);
CREATE INDEX IF NOT EXISTS applications_user_updated_idx ON applications (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS application_events_timeline_idx ON application_events (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS application_documents_user_idx ON application_documents (user_id, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_verifications_job_idx ON job_verifications (job_posting_id, created_at DESC);
