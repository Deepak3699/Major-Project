CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  draft_id UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  delivery_status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now()
);
