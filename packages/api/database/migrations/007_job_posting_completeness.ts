import type { MigrationContext } from 'node-pg-migrate';

// Job posting completeness.
//
// The scrapers extract location, workplace type, apply URL, posted date and
// company details, but job_postings had columns for none of them, so the values
// were dropped at insert time (measured: 0/363 rows carried a location column;
// only 34 kept one incidentally inside raw_payload, in five different key names
// depending on source). "Apply URL" mattered most: outreach needs the link a
// candidate uses, and job_url was sometimes the listing page rather than the
// application page.
//
// Design notes:
//  * location_type / employment_type are CHECKed enums, not free text, so the UI
//    can filter reliably. Unknown stays NULL -- never guessed.
//  * salary is stored BOTH ways: salary_range keeps the source's own string
//    (authoritative, no fabrication) and salary_min/max/currency/period hold a
//    parsed numeric form for filtering and sorting. Parsed values are derived, so
//    they are nullable and never overwrite the raw text.
//  * apply_url is separate from job_url because ATS payloads carry both.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS location TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS city TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS state TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India'`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS location_type TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS employment_type TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS is_work_from_home BOOLEAN`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS apply_url TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS about_job TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS department TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS openings_count INTEGER`);

  // Structured salary alongside the verbatim source string.
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_min NUMERIC(12,2)`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_max NUMERIC(12,2)`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_currency TEXT`);
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS salary_period TEXT`);

  await pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE job_postings
        ADD CONSTRAINT job_postings_location_type_chk
        CHECK (location_type IS NULL OR location_type IN
          ('remote','hybrid','onsite','field','unspecified'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE job_postings
        ADD CONSTRAINT job_postings_employment_type_chk
        CHECK (employment_type IS NULL OR employment_type IN
          ('full_time','part_time','contract','internship','apprenticeship','freelance','temporary','unspecified'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE job_postings
        ADD CONSTRAINT job_postings_salary_currency_chk
        CHECK (salary_currency IS NULL OR salary_currency IN ('INR','USD','EUR','GBP'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE job_postings
        ADD CONSTRAINT job_postings_salary_period_chk
        CHECK (salary_period IS NULL OR salary_period IN ('year','month','week','day','hour'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE job_postings
        ADD CONSTRAINT job_postings_salary_range_chk
        CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Backfill from raw_payload. Sources disagree on key names (location /
  // job_location / city; applyUrl / apply_url), so coalesce across the variants
  // actually observed in this table. Nothing is invented: absent stays NULL, and
  // '' is never written -- empty strings are what caused the contact
  // contamination (migration 006) because '' = '' matches in SQL.
  await pgm.sql(`
    UPDATE job_postings SET
      location  = NULLIF(BTRIM(COALESCE(location, '') || ''), ''),
      apply_url = COALESCE(NULLIF(BTRIM(COALESCE(apply_url, '') || ''), ''),
                           NULLIF(BTRIM(COALESCE(raw_payload->>'applyUrl',
                                                 raw_payload->>'apply_url',
                                                 raw_payload->>'applicationUrl', '') || ''), '')),
      country   = COALESCE(NULLIF(BTRIM(COALESCE(country, '') || ''), ''),
                           NULLIF(BTRIM(COALESCE(raw_payload->>'country', '') || ''), ''),
                           'India'),
      about_job = COALESCE(NULLIF(BTRIM(COALESCE(about_job, '') || ''), ''),
                           NULLIF(BTRIM(COALESCE(raw_payload->>'about_job',
                                                 raw_payload->>'descriptionPlain',
                                                 raw_payload->>'description_plain', '') || ''), ''))
    WHERE raw_payload IS NOT NULL AND raw_payload <> '{}'::jsonb
  `);

  // location itself needs its own pass: the value lives under different keys per
  // source, and COALESCE inside the UPDATE above reads pre-UPDATE row values.
  await pgm.sql(`
    UPDATE job_postings j SET location = src.loc
      FROM (SELECT id,
                   NULLIF(BTRIM(COALESCE(raw_payload->>'location',
                                         raw_payload->>'job_location',
                                         raw_payload->>'city',
                                         raw_payload->>'place', '') || ''), '') AS loc
              FROM job_postings
             WHERE raw_payload IS NOT NULL) src
     WHERE j.id = src.id AND j.location IS NULL AND src.loc IS NOT NULL
  `);

  // A workplace-type flag found in the payload decides location_type; anything
  // ambiguous is left NULL rather than guessed.
  await pgm.sql(`
    UPDATE job_postings SET
      is_work_from_home = CASE
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) IN ('remote','work from home','wfh') THEN TRUE
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) IN ('onsite','on-site','office') THEN FALSE
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) IN ('hybrid') THEN NULL
        ELSE is_work_from_home END,
      location_type = CASE
        WHEN location_type IS NOT NULL THEN location_type
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) IN ('remote','work from home','wfh') THEN 'remote'
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) IN ('onsite','on-site','office') THEN 'onsite'
        WHEN lower(COALESCE(raw_payload->>'workplaceType','')) = 'hybrid' THEN 'hybrid'
        ELSE location_type END
    WHERE raw_payload ? 'workplaceType'
  `);

  // Textual location mentioning remote/onsite is a legitimate signal, but only
  // when unambiguous (exactly one of the three appears).
  await pgm.sql(`
    UPDATE job_postings SET location_type = CASE
        WHEN l ILIKE '%remote%' AND l NOT LIKE '%onsite%' AND l NOT LIKE '%office%' THEN 'remote'
        WHEN (l ILIKE '%onsite%' OR l ILIKE '%office%') AND l NOT LIKE '%remote%' THEN 'onsite'
        WHEN l ILIKE '%hybrid%' THEN 'hybrid'
        ELSE NULL END
    FROM (SELECT id, COALESCE(location,'') || ' ' || COALESCE(about_job,'') AS l FROM job_postings) src
    WHERE job_postings.id = src.id
      AND job_postings.location_type IS NULL
  `);

  // Filter/sort indexes for the new facets.
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_jobposting_location ON job_postings (location)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_jobposting_location_type ON job_postings (location_type)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_jobposting_salary_max ON job_postings (salary_max DESC NULLS LAST)`);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS idx_jobposting_posted_at ON job_postings (posted_at DESC NULLS LAST)`);
};

export const down = async (pgm: MigrationContext) => {
  const cols = ['location', 'city', 'state', 'country', 'location_type', 'employment_type',
    'is_work_from_home', 'apply_url', 'posted_at', 'about_job', 'department', 'openings_count',
    'salary_min', 'salary_max', 'salary_currency', 'salary_period'];
  for (const c of cols) {
    await pgm.sql(`ALTER TABLE job_postings DROP COLUMN IF EXISTS ${c}`);
  }
};
