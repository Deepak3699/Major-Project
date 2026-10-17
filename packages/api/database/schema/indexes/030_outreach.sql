-- Concern: INDEXES (outreach_log, outreach_drafts). Send history per lead +
-- the anti-spam cooldown lookup (lead_id+channel ordered by sent_at) and draft
-- versioning lookup.
CREATE INDEX IF NOT EXISTS idx_outreach_log_lead ON outreach_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_lead_channel_time ON outreach_log(lead_id, channel, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_log_sent_at ON outreach_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_lead_channel ON outreach_drafts(lead_id, channel, version);
