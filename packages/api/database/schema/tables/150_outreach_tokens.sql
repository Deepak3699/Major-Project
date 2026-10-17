-- RFC-8058 one-click unsubscribe: opaque, unguessable token -> recipient contact.
-- Minted at send time so the "unsubscribe" link carries ONLY the token, never an
-- email/phone. This is what makes the public /optout route safe against arbitrary
-- blocklist poisoning (a caller can only act on a token we issued) AND keeps PII
-- out of URLs, request logs, Referer headers and browser history.
CREATE TABLE IF NOT EXISTS outreach_tokens (
  token TEXT PRIMARY KEY,                    -- opaque random (secrets.token_urlsafe)
  normalized_contact TEXT NOT NULL,          -- lower(email) or E.164 phone
  channel TEXT NOT NULL DEFAULT 'email',     -- email | whatsapp
  created_at TIMESTAMPTZ DEFAULT now()
);
