DO $$ BEGIN
  ALTER TABLE candidate_profiles DROP CONSTRAINT IF EXISTS candidate_profiles_remote_preference_chk;
  ALTER TABLE candidate_profiles ADD CONSTRAINT candidate_profiles_remote_preference_chk
    CHECK (remote_preference IN ('any', 'remote', 'hybrid', 'onsite'));
  ALTER TABLE candidate_profiles DROP CONSTRAINT IF EXISTS candidate_profiles_experience_years_chk;
  ALTER TABLE candidate_profiles ADD CONSTRAINT candidate_profiles_experience_years_chk
    CHECK (experience_years BETWEEN 0 AND 60);
  ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_chk;
  ALTER TABLE applications ADD CONSTRAINT applications_status_chk CHECK (status IN (
    'SAVED','RECOMMENDED','READY_TO_APPLY','APPLIED','SCREENING','INTERVIEW','OFFER','REJECTED','WITHDRAWN','JOINED'
  ));
  ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_type_chk;
  ALTER TABLE application_documents ADD CONSTRAINT application_documents_type_chk
    CHECK (document_type IN ('tailored_resume','cover_letter','email_draft'));
  ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_trust_band_chk;
  ALTER TABLE job_postings ADD CONSTRAINT job_postings_trust_band_chk
    CHECK (trust_band IN ('very_high','high','review','low'));
  ALTER TABLE job_postings DROP CONSTRAINT IF EXISTS job_postings_review_status_chk;
  ALTER TABLE job_postings ADD CONSTRAINT job_postings_review_status_chk
    CHECK (review_status IN ('published','pending','quarantined','rejected'));
  ALTER TABLE job_verifications DROP CONSTRAINT IF EXISTS job_verifications_trust_score_chk;
  ALTER TABLE job_verifications ADD CONSTRAINT job_verifications_trust_score_chk
    CHECK (trust_score BETWEEN 0 AND 100);
  ALTER TABLE candidate_feedback DROP CONSTRAINT IF EXISTS candidate_feedback_rating_chk;
  ALTER TABLE candidate_feedback ADD CONSTRAINT candidate_feedback_rating_chk CHECK (rating BETWEEN 1 AND 5);
  ALTER TABLE candidate_feedback DROP CONSTRAINT IF EXISTS candidate_feedback_moderation_status_chk;
  ALTER TABLE candidate_feedback ADD CONSTRAINT candidate_feedback_moderation_status_chk
    CHECK (moderation_status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
