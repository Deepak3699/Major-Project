-- One free lifetime mock round. Pro subscriptions bypass the gate.
CREATE TABLE IF NOT EXISTS practice_mock_rounds (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id UUID
);
