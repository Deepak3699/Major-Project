-- Concern: INDEXES (contact identity, non-unique). The app canonicalises people
-- by case-insensitive email/phone for dedup + suppression joins. These are
-- deliberately NON-unique: a generic HR (hr@corp) legitimately recurs across
-- leads at the same company, and the spec forbids auto-merging low-confidence
-- identities. Expression indexes (lower()) let those lookups use the index.
CREATE INDEX IF NOT EXISTS idx_hr_email_lookup ON hr_contacts(lower(personal_email))
  WHERE personal_email IS NOT NULL AND personal_email <> '';
CREATE INDEX IF NOT EXISTS idx_hr_mobile_lookup ON hr_contacts(personal_mobile)
  WHERE personal_mobile IS NOT NULL AND personal_mobile <> '';
CREATE INDEX IF NOT EXISTS idx_hr_linkedin_lookup ON hr_contacts(lower(linkedin_url))
  WHERE linkedin_url IS NOT NULL;
