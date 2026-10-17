-- Daily-run guard so running the same discovery job twice does not double-process.
CREATE TABLE IF NOT EXISTS daily_runs (
  run_date DATE PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',    -- running | completed | failed
  leads_found INT DEFAULT 0
);
