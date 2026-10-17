CREATE TABLE IF NOT EXISTS outreach_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  subject TEXT,
  body TEXT NOT NULL,
  generated_by TEXT DEFAULT 'gemini-2.5-flash',
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
