import type { MigrationContext } from 'node-pg-migrate';

// Central Gemini usage ledger. Every provider call is logged with token counts,
// estimated cost, latency and outcome so admins can see and cap real spend.
// Additive and idempotent: safe on a fresh DB (schema mirror below) and on an
// already-deployed one.
export const up = async (pgm: MigrationContext) => {
  pgm.createTable('ai_usage_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: { type: 'uuid', references: '"users"(id)', onDelete: 'SET NULL' },
    feature: { type: 'text', notNull: true },
    model: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    error_code: { type: 'text' },
    prompt_tokens: { type: 'integer', notNull: true, default: 0 },
    completion_tokens: { type: 'integer', notNull: true, default: 0 },
    total_tokens: { type: 'integer', notNull: true, default: 0 },
    estimated_cost_usd: { type: 'numeric(12,6)', notNull: true, default: 0 },
    latency_ms: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('ai_usage_events', 'created_at', { name: 'ai_usage_events_created_at_idx' });
  pgm.createIndex('ai_usage_events', ['feature', 'created_at'], { name: 'ai_usage_events_feature_created_idx' });
  pgm.createIndex('ai_usage_events', ['status', 'created_at'], { name: 'ai_usage_events_status_created_idx' });
  pgm.createIndex('ai_usage_events', ['user_id', 'created_at'], { name: 'ai_usage_events_user_created_idx' });
};

export const down = async (pgm: MigrationContext) => {
  pgm.dropTable('ai_usage_events', { ifExists: true });
};
