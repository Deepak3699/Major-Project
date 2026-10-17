CREATE TABLE IF NOT EXISTS verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL,
  result TEXT NOT NULL,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
