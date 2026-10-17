import type { MigrationContext } from 'node-pg-migrate';

// HR contact contamination repair.
//
// The normalizer looked contacts up with
//   WHERE linkedin_url = $1 OR personal_email = $2
// passing '' for both when a scrape found no contact details. Because '' = '' is
// TRUE in SQL, every lead without scraped contact data matched whichever stored
// contact happened to hold an empty-string column -- attaching one person's
// identity to hundreds of leads at unrelated employers (measured: 356/363 leads,
// 98%, pointed at a contact whose current_company_id was a different company).
// The lookup also ignored company entirely, so even genuine hits were reused
// across employers. See normalizer.py for the query fix; this repairs the rows.
//
// Repair strategy: DETACH only, never rewrite lifecycle state. The stage machine
// (functions/020) forbids backward jumps, and it is right to: these leads keep
// their real job posting and company, they just lose a bogus HR identity. Once
// hr_contact_id is NULL the existing self-healing sweep (scheduler.py, which
// selects on COALESCE(hc.personal_email,'')='' via a LEFT JOIN) picks them up and
// re-derives a correctly-scoped contact. Idempotent: each statement only touches
// rows still holding a stale link or an empty string.
export const up = async (pgm: MigrationContext) => {
  // 1. Detach contacts belonging to a different employer than the lead.
  await pgm.sql(`
    UPDATE leads l
       SET hr_contact_id = NULL, updated_at = NOW()
      FROM hr_contacts hc
     WHERE l.hr_contact_id = hc.id
       AND hc.current_company_id IS NOT NULL
       AND hc.current_company_id <> l.company_id
  `);

  // Leads whose contact row had no employer at all were equally untrustworthy.
  await pgm.sql(`
    UPDATE leads l
       SET hr_contact_id = NULL, updated_at = NOW()
      FROM hr_contacts hc
     WHERE l.hr_contact_id = hc.id
       AND hc.current_company_id IS NULL
  `);

  // 2. A contact that survived detach but has no locator must not stay attached.
  await pgm.sql(`
    UPDATE leads l
       SET hr_contact_id = NULL, updated_at = NOW()
      FROM hr_contacts hc
     WHERE l.hr_contact_id = hc.id
       AND NULLIF(hc.linkedin_url, '') IS NULL
       AND NULLIF(hc.personal_email, '') IS NULL
       AND NULLIF(hc.personal_mobile, '') IS NULL
  `);

  // 3. Empty strings behave like values in equality comparisons; NULL does not.
  await pgm.sql(`
    UPDATE hr_contacts SET
      linkedin_url   = NULLIF(linkedin_url, ''),
      personal_email = NULLIF(personal_email, ''),
      personal_mobile = NULLIF(personal_mobile, ''),
      full_name      = NULLIF(full_name, ''),
      contact_url    = NULLIF(contact_url, ''),
      contact_source = NULLIF(contact_source, ''),
      contact_method = NULLIF(contact_method, ''),
      updated_at     = NOW()
  `);

  // 4. Drop detached rows that no longer identify anyone (they would otherwise
  //    linger as orphaned PII with no reachable person).
  await pgm.sql(`
    DELETE FROM hr_contacts hc
     WHERE NULLIF(hc.linkedin_url, '') IS NULL
       AND NULLIF(hc.personal_email, '') IS NULL
       AND NULLIF(hc.personal_mobile, '') IS NULL
       AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.hr_contact_id = hc.id)
       AND NOT EXISTS (SELECT 1 FROM job_postings j WHERE j.hr_contact_id = hc.id)
  `);

  // 5. Block the hazard at the schema level: a contact must carry a real locator.
  //    Retention anonymisation (scheduler.enforce_retention) legitimately blanks
  //    every locator once the row stops being reachable PII, so those rows are
  //    exempt -- identified by the retained_anonymised_at marker it stamps. COALESCE is
  //    required: with a NULL provenance the `?` operator yields NULL, and a
  //    CHECK that evaluates to NULL passes, so the guard would not fire.
  await pgm.sql(`
    ALTER TABLE hr_contacts
      ADD CONSTRAINT hr_contacts_has_locator CHECK (
        NULLIF(linkedin_url, '') IS NOT NULL
        OR NULLIF(personal_email, '') IS NOT NULL
        OR NULLIF(personal_mobile, '') IS NOT NULL
        OR COALESCE(extraction_provenance ? 'retained_anonymised_at', false)
      ) NOT VALID
  `);
  await pgm.sql(`ALTER TABLE hr_contacts VALIDATE CONSTRAINT hr_contacts_has_locator`);

  // 6. Email has no global uniqueness (a shared inbox legitimately appears at
  //    several employers), so bound it per employer: one company must not hold two
  //    rows for the same address. linkedin_url needs nothing extra -- the table's
  //    global UNIQUE already makes a profile belong to exactly one contact.
  await pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_hrcontacts_company_email
      ON hr_contacts (current_company_id, lower(personal_email))
      WHERE personal_email IS NOT NULL AND personal_email <> ''
  `);
};

export const down = async (pgm: MigrationContext) => {
  await pgm.sql(`DROP INDEX IF EXISTS uq_hrcontacts_company_email`);
  await pgm.sql(`ALTER TABLE hr_contacts DROP CONSTRAINT IF EXISTS hr_contacts_has_locator`);
  // Contaminated links are deliberately not restored.
};
