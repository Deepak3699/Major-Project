-- Concern: FUNCTIONS.
-- Canonical trigger helper: stamps updated_at on every row modification so
-- freshness is guaranteed at the storage layer, never relying on callers to
-- remember to set it (a recurring source of stale "last touched" data).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
