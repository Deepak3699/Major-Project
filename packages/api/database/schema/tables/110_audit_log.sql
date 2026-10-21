CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Keep the actor UUID as an immutable audit reference after account deletion.
  -- A foreign key with ON DELETE SET NULL would UPDATE this append-only row.
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
