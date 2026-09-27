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

-- One row per pool (division + round + letter) holding pool-level state; `locked`
-- is the first use (the Head Judge's lock toggle, freezing that pool's scores,
-- teams and judges), so later pool-specific settings have a home without another
-- one-off table. No row is required for an ordinary pool: missing reads as
-- locked = false. Unlocking sets locked back to false rather than deleting the
-- row, so it keeps whatever else gets added to it later.
CREATE TABLE IF NOT EXISTS pools (
  division_id  uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  pool_id      text NOT NULL,
  locked       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (division_id, round_number, pool_id)
);

-- Whether a pool's results are visible on its public permalink (before, only the
-- teams and judges show; after, the full results, judges never named), and the
-- short code that permalink resolves ("freestylejudge.com/r/<code>"): a plain
-- lookup key, not a secret, generated the first time it's needed.
ALTER TABLE pools ADD COLUMN IF NOT EXISTS results_published boolean NOT NULL DEFAULT false;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS short_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pools_short_code ON pools(short_code) WHERE short_code IS NOT NULL;

-- One row per performance: a team playing once in a pool. Created when the Head
-- Judge starts the routine (started_at is the timer starting) and marked
-- cancelled if it is cancelled; finished is set when the head judge moves on.
-- Judge notes and scores hang off it. team_id can go away (teams are edited);
-- routine_players keeps who competed.
CREATE TABLE IF NOT EXISTS routines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  division_id  uuid REFERENCES divisions(id) ON DELETE SET NULL,
  round_number integer NOT NULL,
  pool_id      text NOT NULL,
  team_id      uuid REFERENCES teams(id) ON DELETE SET NULL,
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'cancelled', 'finished')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routines_event ON routines(event_id, status);

-- Who competed in a routine, fixed when it starts (aliases resolved to the main player).
CREATE TABLE IF NOT EXISTS routine_players (
  routine_id uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  PRIMARY KEY (routine_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_routine_players_player ON routine_players(player_id);

-- The Head Judge tool's live state for an event: which pool and team are
-- playing and when the routine's first throw was clicked (NULL = not started).
-- One row per event.
CREATE TABLE IF NOT EXISTS event_play_state (
  event_id           uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  division_id        uuid REFERENCES divisions(id) ON DELETE SET NULL,
  round_number       integer,
  pool_id            text,
  team_id            uuid REFERENCES teams(id) ON DELETE SET NULL,
  routine_started_at timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- The running routine (NULL when none is running).
ALTER TABLE event_play_state ADD COLUMN IF NOT EXISTS routine_id uuid REFERENCES routines(id) ON DELETE SET NULL;

-- What a judge pressed during a routine under the Fpa2027 judging system
-- (Execution: large_error, medium_error, minor_error, average_completion,
-- clean_completion; Artistic Impression: teamwork_*, music_*, form_*; Difficulty:
-- bad, average, good). For Execution and Artistic Impression only the note type
-- is stored; point values live in the event's judging settings. A Difficulty
-- note also keeps where the judge tapped on the numberline (line_position, 0 to
-- 1), the numberline score that was (position x the line's range then:
-- line_value) and the rating's multiplier then, separately; its points are
-- line_value x multiplier. `id` is made by the judge's screen so a resent note
-- is stored once; noted_at is the press, on the server's clock. player_id is
-- the judge.
CREATE TABLE IF NOT EXISTS fpa2027_judge_notes (
  id            uuid PRIMARY KEY,
  routine_id    uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  event_id      uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  category_type text NOT NULL,
  note_type     text NOT NULL,
  noted_at      timestamptz NOT NULL
);
ALTER TABLE fpa2027_judge_notes ADD COLUMN IF NOT EXISTS line_position numeric CHECK (line_position BETWEEN 0 AND 1);
ALTER TABLE fpa2027_judge_notes ADD COLUMN IF NOT EXISTS line_value numeric;
ALTER TABLE fpa2027_judge_notes ADD COLUMN IF NOT EXISTS multiplier numeric;
CREATE INDEX IF NOT EXISTS idx_fpa2027_notes_routine ON fpa2027_judge_notes(routine_id, category_type, note_type);
CREATE INDEX IF NOT EXISTS idx_fpa2027_notes_judge ON fpa2027_judge_notes(player_id);

-- The score a judge submits for a routine: one per routine, judge and category.
-- Keeps what cannot be recreated (the baseline the computer made, the judge's
-- change, the settings used); note counts are read from fpa2027_judge_notes,
-- which are locked once a score is submitted.
-- One judge's finished ranking of a Simple Ranking pool's teams, best first
-- (see web/lib/simple-ranking.ts). judge_token is a random id the judge's
-- browser makes up and keeps, so the same phone re-submitting replaces its row
-- instead of counting twice; there is no login and no assignment of judges.
CREATE TABLE IF NOT EXISTS simple_ranking_ballots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  division_id  uuid NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  pool_id      text NOT NULL,
  judge_token  text NOT NULL,
  ranking      jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, round_number, pool_id, judge_token)
);

CREATE TABLE IF NOT EXISTS fpa2027_judge_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id        uuid NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  judge_player_id   uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  category_type     text NOT NULL,
  baseline_estimate numeric NOT NULL,
  adjust_percent    numeric NOT NULL DEFAULT 0,
  score             numeric NOT NULL,
  settings          jsonb NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (routine_id, judge_player_id, category_type)
);
CREATE INDEX IF NOT EXISTS idx_fpa2027_scores_judge ON fpa2027_judge_scores(judge_player_id);

-- Counts of each note type per routine, judge and category, straight from the notes.
CREATE OR REPLACE VIEW fpa2027_judge_note_counts AS
  SELECT routine_id, player_id AS judge_player_id, category_type, note_type, count(*) AS n,
         COALESCE(sum(line_value * multiplier), 0) AS points
  FROM fpa2027_judge_notes
  GROUP BY routine_id, player_id, category_type, note_type;

-- When each judge's screen last asked the server for news (its poll), so the
-- Head Judge can see who is connected. Ephemeral: written by the judge's poll,
-- never synced between the local server and Neon, and not part of backups.
CREATE TABLE IF NOT EXISTS judge_presence (
  event_id  uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seen_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);

-- Published rankings and ratings, one row per type and date (what the Rankings
-- Generator publishes and the public points API serves). `key` is
-- "<type>-<division>_<date>", e.g. ranking-open_2026-9-25 (exactly one "_"):
-- ranking-open, ranking-women and rating-open. `data` is the array the public API
-- returns; `meta` holds the counts, the date range and the parameters used.
CREATE TABLE IF NOT EXISTS points_snapshots (
  key         text PRIMARY KEY,
  type        text NOT NULL,
  division    text NOT NULL,
  date        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_hidden   boolean NOT NULL DEFAULT false,
  data        jsonb NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}'
);

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

-- One row per billed Claude call (the parse-with-Claude tools), for the cost shown in
-- Settings. Tokens are the API's own usage report; cost_usd is worked out at the time
-- from the list price (NULL when the model's price isn't known). No foreign key: a log
-- outlives users. Deliberately not in the backup tables, so restoring an old backup
-- never erases the spending history.
CREATE TABLE IF NOT EXISTS claude_usage (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  feature       text NOT NULL,
  model         text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6),
  stop_reason   text,
  user_id       uuid
);
CREATE INDEX IF NOT EXISTS idx_claude_usage_created_at ON claude_usage(created_at);

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

-- Whether the event is being judged right now. Only playing events list their
-- judges on the public landing page; toggled in the Event Creator's Events tab.
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_playing boolean NOT NULL DEFAULT false;

-- The Discord channel the bot posts the event's play orders and results to
-- (set in the Event Creator), and the thread it keeps there: created by the
-- bot on its first post, replaced if deleted, cleared when the channel changes.
ALTER TABLE events ADD COLUMN IF NOT EXISTS discord_channel_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS discord_thread_id text;

-- The head judge's tunables for the event, keyed by judging system (rules id)
-- and then category, e.g. {"Fpa2027": {"Ex": {"noteWeights": {"large_error": -3}}}}.
-- Anything missing falls back to the defaults in code.
ALTER TABLE events ADD COLUMN IF NOT EXISTS judging_settings jsonb NOT NULL DEFAULT '{}';

-- Named copies of one judging system's settings, shared across events. Loading
-- a preset copies its values into an event, so later edits never reach back.
CREATE TABLE IF NOT EXISTS judging_presets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rules_id   text NOT NULL,
  name       text NOT NULL,
  settings   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_judging_presets_name ON judging_presets(rules_id, lower(name));
