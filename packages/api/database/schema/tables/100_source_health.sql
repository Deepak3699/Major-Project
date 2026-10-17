CREATE TABLE IF NOT EXISTS source_health (
  source_name TEXT PRIMARY KEY,
  consecutive_failures INT DEFAULT 0,
  circuit_open_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_reason TEXT
);
