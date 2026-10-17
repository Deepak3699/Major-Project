CREATE TABLE IF NOT EXISTS scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sources_attempted INT,
  sources_succeeded INT,
  sources_circuit_broken TEXT[],
  leads_found INT,
  leads_deduped INT,
  errors JSONB
);
