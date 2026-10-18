import type { MigrationContext } from 'node-pg-migrate';

// Existing rows were collected for the former recruiter workflow and have not
// been reviewed under the candidate platform's trust and source rules. Hold
// active listings for admin review before showing them to candidates.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    UPDATE job_postings
       SET review_status = 'pending', trust_score = 0, trust_band = 'review'
     WHERE is_active = TRUE AND review_status = 'published'
  `);
};

// Review decisions are operational data, so rollback intentionally keeps the
// pending state instead of publishing unreviewed listings.
export const down = async (_pgm: MigrationContext) => {};
