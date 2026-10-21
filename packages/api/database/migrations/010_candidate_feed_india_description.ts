import type { MigrationContext } from 'node-pg-migrate';

// Candidate listings must have a confirmed India scope and a usable job
// description. Older rows inherit country='India' from a legacy DB default, so
// that column alone is not evidence that a global listing is actually Indian.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS india_confirmed BOOLEAN NOT NULL DEFAULT FALSE`);
  await pgm.sql(`
    WITH classified AS (
      SELECT jp.id,
             lower(trim(COALESCE(jp.raw_payload->'country'->>'name', jp.raw_payload->'country'->>'code',
                                 jp.raw_payload->>'country', jp.raw_payload->>'country_code', ''))) AS raw_country,
             lower(COALESCE(NULLIF(jp.location,''), NULLIF(jp.raw_payload->'location'->>'name',''),
                            NULLIF(jp.raw_payload->'location'->>'city',''), NULLIF(jp.raw_payload->'location'->>'state',''),
                            NULLIF(jp.raw_payload->>'location',''),
                            NULLIF(jp.raw_payload->>'job_location',''), NULLIF(jp.raw_payload->>'city',''),
                            NULLIF(jp.raw_payload->>'state',''), '')) AS job_location,
             lower(COALESCE(jp.source_site, '')) AS source_site,
             length(trim(COALESCE(NULLIF(jp.description, ''), NULLIF(jp.about_job,''),
                                  jp.raw_payload->>'description', jp.raw_payload->>'descriptionPlain', ''))) AS description_length
        FROM job_postings jp
    ), eligible AS (
      SELECT id,
             description_length >= 80
             AND (raw_country = '' OR raw_country IN ('india', 'in', 'ind'))
             AND (
               job_location ~* '\\m(india|bengaluru|bangalore|mumbai|new delhi|delhi|ncr|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|ahmedabad|surat|jaipur|kochi|cochin|chandigarh|bhubaneswar|indore|nagpur|vadodara|visakhapatnam|mysore|mysuru|thiruvananthapuram|trivandrum|coimbatore|lucknow|kanpur|patna|bhopal|rajkot|goa|dehradun|guwahati|ranchi|raipur|madurai|srinagar|shimla|gangtok|imphal|shillong|aizawl|kohima|agartala|itanagar|west bengal|tamil nadu|karnataka|maharashtra|telangana|andhra pradesh|gujarat|rajasthan|uttar pradesh|madhya pradesh|kerala|haryana|punjab|bihar|odisha|assam|jharkhand|chhattisgarh|uttarakhand|himachal pradesh|jammu|kashmir|ladakh|puducherry|pondicherry|remote[ -]+india)\\M'
               OR source_site ~* '(^|[^a-z])(naukri|shine|internshala|freshersworld|instahyre|cutshort|foundit|unstop|jobinsider|iimjobs|timesjobs|apna|workindia|hirist|classicjobs|ambitionbox|freshershunt|offcampusjobs4u|job4freshers|jobbinge)([^a-z]|$)'
             ) AS keep
        FROM classified
    )
    UPDATE job_postings jp
       SET india_confirmed = e.keep,
           country = CASE WHEN e.keep THEN 'India'
                          ELSE NULLIF(jp.raw_payload->>'country', '') END,
           is_active = CASE WHEN e.keep THEN jp.is_active ELSE FALSE END,
           review_status = CASE WHEN e.keep THEN jp.review_status ELSE 'rejected' END
      FROM eligible e
     WHERE jp.id = e.id
  `);
  await pgm.sql(`
    WITH released AS (
      UPDATE job_postings jp
         SET review_status='published'
       WHERE jp.india_confirmed AND jp.is_active AND jp.review_status='pending' AND jp.trust_score >= 70
       RETURNING jp.id,jp.trust_score,jp.trust_band
    )
    INSERT INTO job_verifications (job_posting_id,verifier_id,trust_score,trust_band,evidence,review_status)
    SELECT id,NULL,trust_score,trust_band,
           jsonb_build_array(jsonb_build_object('signal','Automatic quality review','points',trust_score,
             'detail','Published automatically because listing quality met the 70 point threshold')),
           'published'
      FROM released
  `);
  await pgm.sql(`CREATE INDEX IF NOT EXISTS job_postings_india_feed_idx ON job_postings (india_confirmed,review_status,is_active,first_seen_at DESC)`);
};

export const down = async (_pgm: MigrationContext) => {};
