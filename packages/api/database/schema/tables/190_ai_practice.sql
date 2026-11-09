-- AI practice: subscription-gated mock interviews and adaptive learning tracks.
-- The candidates' own answers stay in this schema; provider calls never write
-- outside it. Quota enforcement counts calendar-month sessions, so no usage
-- drift can appear between a subscription row and actual activity.

CREATE TABLE IF NOT EXISTS practice_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'system',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  renewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_plan TEXT NOT NULL DEFAULT 'pro',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, status)
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_focus TEXT NOT NULL DEFAULT 'General',
  difficulty TEXT NOT NULL DEFAULT 'standard',
  question_count SMALLINT NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'in_progress',
  model TEXT NOT NULL DEFAULT 'template',
  overall_score SMALLINT,
  verdict TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx SMALLINT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  topic TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL,
  ideal_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer TEXT NOT NULL DEFAULT '',
  feedback JSONB NOT NULL DEFAULT 'null'::jsonb,
  score SMALLINT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, idx)
);

CREATE TABLE IF NOT EXISTS learning_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_focus TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL DEFAULT 'template',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_focus)
);

CREATE TABLE IF NOT EXISTS learning_module_progress (
  track_id UUID NOT NULL REFERENCES learning_tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_index SMALLINT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, module_index)
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_started
  ON interview_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_questions_session
  ON interview_questions (session_id, idx);
CREATE INDEX IF NOT EXISTS idx_practice_upgrade_requests_pending
  ON practice_upgrade_requests (status, created_at);
