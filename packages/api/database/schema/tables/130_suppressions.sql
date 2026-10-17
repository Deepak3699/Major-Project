-- Do-not-contact / suppression store: server-side opt-out + manual/bounce/
-- compliance suppression, keyed by normalized contact so a person is suppressed
-- across all leads. Read+written by send worker, webhook and admin controls.
CREATE TABLE IF NOT EXISTS suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_contact TEXT NOT NULL,          -- lower(email) or E.164 phone
  channel TEXT NOT NULL DEFAULT 'any',       -- email | whatsapp | any
  reason TEXT NOT NULL,                      -- opted_out | bounced | blocked | compliance_hold | manual
  source TEXT,                               -- webhook | manual | provider | admin
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (normalized_contact, channel)
);
