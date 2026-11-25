import type { MigrationContext } from 'node-pg-migrate';

// Repair JSONB columns that were written through JSON.stringify() while the
// postgres driver also serialised the value, leaving a JSON string instead of
// an object/array. New writes bind the value directly; this normalises any rows
// created before that fix. Additive and safe to run more than once.
export const up = async (pgm: MigrationContext) => {
  await pgm.sql(`
    UPDATE interview_sessions
       SET report = (report #>> '{}')::jsonb
     WHERE jsonb_typeof(report) = 'string'
       AND left(report #>> '{}', 1) IN ('{', '[');

    UPDATE interview_sessions
       SET presentation = (presentation #>> '{}')::jsonb
     WHERE jsonb_typeof(presentation) = 'string'
       AND left(presentation #>> '{}', 1) IN ('{', '[');

    UPDATE interview_questions
       SET feedback = (feedback #>> '{}')::jsonb
     WHERE jsonb_typeof(feedback) = 'string'
       AND left(feedback #>> '{}', 1) IN ('{', '[');

    UPDATE interview_questions
       SET ideal_points = (ideal_points #>> '{}')::jsonb
     WHERE jsonb_typeof(ideal_points) = 'string'
       AND left(ideal_points #>> '{}', 1) IN ('{', '[');

    UPDATE learning_tracks
       SET payload = (payload #>> '{}')::jsonb
     WHERE jsonb_typeof(payload) = 'string'
       AND left(payload #>> '{}', 1) IN ('{', '[');

    UPDATE settings
       SET value = (value #>> '{}')::jsonb
     WHERE key = 'recommendation_model_runtime'
       AND jsonb_typeof(value) = 'string'
       AND left(value #>> '{}', 1) IN ('{', '[');
  `);
};

// Rollback-only. Normal startup never runs this.
export const down = async (_pgm: MigrationContext) => {};
