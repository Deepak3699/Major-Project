-- Concern: INDEXES (job_postings). Justified by the leads list join/filters
-- (source_site, experience_level) + dedup (fingerprint is the UNIQUE key) +
-- daily "active, recently seen" discovery sweep.
CREATE INDEX IF NOT EXISTS idx_jobposting_active ON job_postings(is_active, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_jobposting_source_site ON job_postings(source_site);
CREATE INDEX IF NOT EXISTS idx_jobposting_experience ON job_postings(experience_level);
