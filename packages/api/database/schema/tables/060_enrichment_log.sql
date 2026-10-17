CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  request_payload JSONB,
  response_payload JSONB,
  credits_used INT DEFAULT 1,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
