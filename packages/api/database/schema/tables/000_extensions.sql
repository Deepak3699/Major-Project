-- Extensions (applied first; other objects depend on them).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive email equality
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram fuzzy search (ILIKE / similarity)
