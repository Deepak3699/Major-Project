import type { MigrationContext } from 'node-pg-migrate';

// Re-score existing pending listings under the same evidence policy used by
// the candidate API. Listings scoring 70 or more are released.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    WITH job_signals AS (
      SELECT jp.id, jp.title, jp.description, jp.about_job, jp.source_site, jp.apply_url, jp.job_url,
             jp.posted_at, jp.first_seen_at, jp.raw_payload, c.name AS company_name, c.domain AS company_domain,
             lower(regexp_replace(substring(COALESCE(jp.apply_url,jp.job_url,'') from '^https?://([^/:?#]+)'), '^www\\.', '')) AS job_host,
             GREATEST(COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),0),1) AS source_count
        FROM job_postings jp JOIN companies c ON c.id=jp.company_id
       WHERE jp.is_active=true AND jp.review_status='pending'
    ), scored AS (
      SELECT id,
        (CASE WHEN source_site ~* '(greenhouse|lever|workday|ashby|smartrecruiters|bamboohr|teamtailor|recruitee|breezy|company career|official)'
                    OR (NULLIF(company_domain,'') IS NOT NULL AND job_host=lower(regexp_replace(company_domain,'^www\\.','')))
              THEN 30 ELSE 0 END
         + CASE WHEN NULLIF(company_domain,'') IS NULL THEN 0
                WHEN job_host=lower(regexp_replace(company_domain,'^www\\.',''))
                  OR job_host LIKE '%.' || lower(regexp_replace(company_domain,'^www\\.','')) THEN 20 ELSE 10 END
         + CASE WHEN COALESCE(apply_url,job_url,'') ~* '^https://' THEN 15 ELSE 0 END
         + CASE WHEN COALESCE(posted_at,first_seen_at,NOW()) >= NOW()-INTERVAL '7 days' THEN 10
                WHEN COALESCE(posted_at,first_seen_at,NOW()) >= NOW()-INTERVAL '30 days' THEN 5 ELSE 0 END
         + CASE WHEN COALESCE(raw_payload->>'contact_verified','false')='true'
                  OR COALESCE(raw_payload->>'email_verified','false')='true' THEN 10 ELSE 0 END
         + CASE WHEN source_count>1 THEN 10 ELSE 0 END
         + CASE WHEN title IS NOT NULL AND company_name IS NOT NULL
                    AND length(COALESCE(description,about_job,''))>=180
                    AND COALESCE(apply_url,job_url,'')<>'' THEN 5 ELSE 0 END
        )::smallint AS quality_score
        FROM job_signals
    ), updated AS (
      UPDATE job_postings jp
         SET trust_score=s.quality_score,
             trust_band=CASE WHEN s.quality_score>=94 THEN 'very_high' WHEN s.quality_score>=80 THEN 'high'
                             WHEN s.quality_score>=60 THEN 'review' ELSE 'low' END,
             review_status=CASE WHEN s.quality_score>=70 THEN 'published' ELSE jp.review_status END
        FROM scored s
       WHERE jp.id=s.id
       RETURNING jp.id,jp.trust_score,jp.trust_band,jp.review_status
    )
    INSERT INTO job_verifications (job_posting_id,verifier_id,trust_score,trust_band,evidence,review_status)
    SELECT id,NULL,trust_score,trust_band,
           jsonb_build_array(jsonb_build_object('signal','Automatic quality review','points',trust_score,
             'detail','Published automatically because verified listing quality met the 70 point threshold')),
           review_status
      FROM updated WHERE review_status='published'
  `);
};

// Automatic releases are operational history and are retained on rollback.
export const down = async (_pgm: MigrationContext) => {};
