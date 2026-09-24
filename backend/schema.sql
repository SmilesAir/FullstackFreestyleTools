CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Renames (idempotent): results -> divisions, result_teams -> teams,
-- result_team_players -> team_players, plus their FK columns. Runs BEFORE the
-- CREATE TABLE IF NOT EXISTS statements below so an already-deployed database
-- is renamed in place (rows, PKs and FKs carry over) instead of getting a
-- second, empty table created under the new name. Constraint names keep their
-- old prefixes; that is cosmetic.
DO $$
BEGIN
  IF to_regclass('public.results') IS NOT NULL AND to_regclass('public.divisions') IS NULL THEN
    ALTER TABLE results RENAME TO divisions;
  END IF;
  IF to_regclass('public.result_teams') IS NOT NULL AND to_regclass('public.teams') IS NULL THEN
    ALTER TABLE result_teams RENAME TO teams;
  END IF;
  IF to_regclass('public.result_team_players') IS NOT NULL AND to_regclass('public.team_players') IS NULL THEN
    ALTER TABLE result_team_players RENAME TO team_players;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'result_id') THEN
    ALTER TABLE teams RENAME COLUMN result_id TO division_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'team_players' AND column_name = 'result_team_id') THEN
    ALTER TABLE team_players RENAME COLUMN result_team_id TO team_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ranking_points' AND column_name = 'results_id') THEN
    ALTER TABLE ranking_points RENAME COLUMN results_id TO division_id;
  END IF;
END
$$;
ALTER INDEX IF EXISTS idx_results_event_id RENAME TO idx_divisions_event_id;
ALTER INDEX IF EXISTS idx_result_teams_result_id RENAME TO idx_teams_division_id;
ALTER INDEX IF EXISTS idx_rtp_result_team_id RENAME TO idx_team_players_team_id;
ALTER INDEX IF EXISTS idx_rtp_player_id RENAME TO idx_team_players_player_id;
ALTER INDEX IF EXISTS idx_ranking_points_results_id RENAME TO idx_ranking_points_division_id;

CREATE TABLE IF NOT EXISTS players (
  id             uuid PRIMARY KEY,
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  alias_id       uuid REFERENCES players(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  gender         text,
  country        text,
  fpa_website_id text,
  membership     integer,
  created_at     timestamptz NOT NULL,
  last_active    timestamptz NOT NULL,
  hidden         boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_players_alias_id ON players(alias_id);

-- Idempotent for the already-deployed database (CREATE TABLE IF NOT EXISTS above
-- is a no-op once the table exists, so the hidden column needs adding explicitly).
ALTER TABLE players ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_players_hidden ON players(hidden);

-- Trigram indexes power fuzzy/typo-tolerant name search (similarity(), the % operator).
CREATE INDEX IF NOT EXISTS idx_players_first_name_trgm ON players USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_players_last_name_trgm ON players USING gin (last_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY,
  event_name  text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL,
  fpa_id      text,
  post_name   text
);

CREATE TABLE IF NOT EXISTS divisions (
  id            uuid PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  division_name text NOT NULL,
  raw_text      text NOT NULL,
  is_hidden     boolean,
  created_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_divisions_event_id ON divisions(event_id);

CREATE TABLE IF NOT EXISTS teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  pool_id      text NOT NULL,
  place        integer,
  points       numeric,
  play_order   integer
);
CREATE INDEX IF NOT EXISTS idx_teams_division_id ON teams(division_id);

CREATE TABLE IF NOT EXISTS team_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON team_players(team_id);
CREATE INDEX IF NOT EXISTS idx_team_players_player_id ON team_players(player_id);

-- A player judging one pool of a round. Tied to the pool by (division, round,
-- pool letter), not to team rows, so re-seeding or rearranging never loses them.
CREATE TABLE IF NOT EXISTS pool_judges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id   uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_number  integer NOT NULL,
  pool_id       text NOT NULL,
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  category_type text NOT NULL,
  UNIQUE (division_id, round_number, pool_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pool_judges_player_id ON pool_judges(player_id);

CREATE TABLE IF NOT EXISTS rankings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  category      text NOT NULL,
  rank          integer,
  points        numeric,
  results_count integer
);
CREATE INDEX IF NOT EXISTS idx_rankings_player_id ON rankings(player_id);
CREATE INDEX IF NOT EXISTS idx_rankings_category ON rankings(category);

CREATE TABLE IF NOT EXISTS ranking_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id  uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  division_id uuid REFERENCES divisions(id) ON DELETE SET NULL,
  points      numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ranking_points_ranking_id ON ranking_points(ranking_id);
CREATE INDEX IF NOT EXISTS idx_ranking_points_division_id ON ranking_points(division_id);

-- Login accounts for the web app (web/). Not part of the JSON migration —
-- never truncated by migrate.js's reload.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
-- Nullable: OAuth-only accounts (Google/Discord) have no password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Self-service linking: which player row is this login? (one user <-> one player)
ALTER TABLE users ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_player_id_unique ON users(player_id);

-- Discord snowflake ID, for a future bot to @mention/DM this user.
-- Auto-filled on Discord OAuth sign-in; also manually editable on /profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id text;

-- Permissions: one flag per tool, bundled into named groups, groups assigned to users.
-- is_admin (above) bypasses this entirely.
CREATE TABLE IF NOT EXISTS permission_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_permissions (
  group_id       uuid NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  PRIMARY KEY (group_id, permission_key)
);

CREATE TABLE IF NOT EXISTS user_permission_groups (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

-- Generic app-wide key/value settings (Discord bot token today, more later),
-- editable via the admin-only Settings tool instead of redeploying env vars.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fixed-window request counters backing the public API's rate limiter.
-- bucket_key embeds the window (e.g. "1.2.3.4:rankings:29123456"), so a plain
-- upsert-and-increment is all a check needs; expired rows are swept lazily.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key text PRIMARY KEY,
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires_at ON api_rate_limits(expires_at);

-- Metadata for full-database backups; the actual gzipped dump lives in Vercel
-- Blob (blob_url), not here. Deliberately has NO foreign key to any other
-- table (not even users) — a backup's own record must survive independent of
-- whatever a restore does to the tables it describes.
CREATE TABLE IF NOT EXISTS backups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename   text NOT NULL,
  blob_url   text NOT NULL,
  size_bytes bigint NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('manual', 'automatic', 'uploaded', 'pre_restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Event Creator: a `divisions` row is one division of one event. These columns
-- hold the division's setup; teams live in `teams` (round_number = 0,
-- pool_id = 'roster' is the unseeded roster; 1 = Finals, 2 = Semifinals,
-- 3 = Quarterfinals, 4 = Preliminaries).
-- pool_config JSONB holds per-round length and per-pool judge assignments,
-- which have no natural per-row home in teams.
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS rules_id text NOT NULL DEFAULT 'Fpa2020';
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS head_judge_player_id uuid REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS director_player_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS pool_config jsonb NOT NULL DEFAULT '{}';
-- Routine length for the whole division (UI offers 3/4/5 minutes; Open Co-op defaults to 4).
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS routine_seconds integer NOT NULL DEFAULT 180;

-- Order a team plays within its pool (1 = first); NULL until someone arranges the pool.
-- Separate from place, which is the result after the pool has played.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS play_order integer;
