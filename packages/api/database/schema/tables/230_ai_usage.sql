-- Mirror of migration 021_ai_usage.ts for a fresh declarative schema build.
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON ai_usage_events (created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_created_idx ON ai_usage_events (feature, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_status_created_idx ON ai_usage_events (status, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx ON ai_usage_events (user_id, created_at);
