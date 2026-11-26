import type { MigrationContext } from 'node-pg-migrate';

// Activity telemetry for the admin "People & activity" workspace.
//
// Written as idempotent DDL so the declarative schema build
// (database/schema/tables/240_user_activity.sql) and an existing deployed
// database converge to exactly the same structure.
export const up = async (pgm: MigrationContext) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_status_check
        CHECK (status IN ('active', 'suspended'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS activity_sessions (
      session_id TEXT PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ,
      active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      page_views INTEGER NOT NULL DEFAULT 0 CHECK (page_views >= 0),
      entry_path TEXT NOT NULL DEFAULT '/',
      last_path TEXT NOT NULL DEFAULT '/',
      referrer TEXT,
      device TEXT NOT NULL DEFAULT 'desktop',
      browser TEXT NOT NULL DEFAULT 'other',
      os TEXT NOT NULL DEFAULT 'other',
      country TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES activity_sessions(session_id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'page_view',
      path TEXT NOT NULL DEFAULT '/',
      title TEXT,
      active_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activity_daily (
      day DATE NOT NULL,
      actor_key TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      active_seconds BIGINT NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      page_views INTEGER NOT NULL DEFAULT 0 CHECK (page_views >= 0),
      PRIMARY KEY (day, actor_key)
    );

    CREATE TABLE IF NOT EXISTS activity_page_daily (
      day DATE NOT NULL,
      path TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
      active_seconds BIGINT NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
      PRIMARY KEY (day, path)
    );

    CREATE INDEX IF NOT EXISTS activity_sessions_started_idx
      ON activity_sessions (started_at DESC);
    CREATE INDEX IF NOT EXISTS activity_sessions_last_seen_idx
      ON activity_sessions (last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS activity_sessions_user_seen_idx
      ON activity_sessions (user_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS activity_sessions_visitor_idx
      ON activity_sessions (visitor_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
      ON activity_events (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_events_created_idx
      ON activity_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_daily_user_day_idx
      ON activity_daily (user_id, day DESC);
    CREATE INDEX IF NOT EXISTS activity_daily_day_idx
      ON activity_daily (day DESC);
    CREATE INDEX IF NOT EXISTS activity_page_daily_day_idx
      ON activity_page_daily (day DESC);
  `);
};

export const down = async (pgm: MigrationContext) => {
  pgm.sql(`
    DROP TABLE IF EXISTS activity_page_daily;
    DROP TABLE IF EXISTS activity_daily;
    DROP TABLE IF EXISTS activity_events;
    DROP TABLE IF EXISTS activity_sessions;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
    ALTER TABLE users DROP COLUMN IF EXISTS auth_version;
    ALTER TABLE users DROP COLUMN IF EXISTS last_seen_at;
    ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
    ALTER TABLE users DROP COLUMN IF EXISTS status;
  `);
};
