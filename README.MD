# Backend

- Contains all data — stored in Neon Postgres, has players, events, tournament results, and rankings

### Data structure

**Player table**

| Field           | Type              | Description                                              |
| --------------- | ----------------- | ---------------------------------------------------------- |
| id              | uuid               | Random GUID, primary key                                   |
| first_name      | text               | First name(s)                                               |
| last_name       | text               | Last name(s)                                                 |
| alias_id        | uuid, nullable     | ID of the primary entry for this player, if this is an alias |
| gender          | text, nullable     | M / F / X                             |
| country         | text, nullable     | Country code                    |
| fpa_website_id  | text, nullable     | ID of the player on the FPA website            |
| membership      | integer            | Membership status/level                  |
| created_at      | timestamp          | When the record was created                    |
| last_active     | timestamp          | When the player was last active                      |

**Events table**

| Field       | Type           | Description                                     |
| ----------- | -------------- | ------------------------------------------------ |
| id          | uuid           | Random GUID, primary key                          |
| event_name  | text           | Name of the event                                  |
| start_date  | date           | Event start date                                   |
| end_date    | date           | Event end date                                     |
| created_at  | timestamp      | When the record was created                        |
| fpa_id      | text, nullable | ID of the event on the FPA website                 |
| post_name   | text, nullable | URL slug for the event's FPA website post          |
| is_playing  | boolean        | Whether the event is being judged now (default false); playing events list their pool's judges on the public landing page |
| judging_settings | jsonb     | The head judge's tunables, keyed by judging system then category (default `{}`; anything missing uses the defaults in code) |

**Divisions table** (one row per division of an event; formerly `results`)

| Field         | Type            | Description                                    |
| ------------- | --------------- | ------------------------------------------------ |
| id            | uuid            | Random GUID, primary key                          |
| event_id      | uuid            | Foreign key to events                                      |
| division_name | text            | Division name (e.g. "Open Pairs")                 |
| raw_text      | text, nullable  | Original raw results text                          |
| is_hidden     | boolean, nullable         | Whether the result is hidden from public view      |
| created_at    | timestamp       | When the record was created                        |

Each division is broken into rounds/pools/teams, so divisions also need child tables to normalize that nesting (`round_number = 0`, `pool_id = 'roster'` is the unseeded roster; 1 = Finals, 2 = Semifinals, 3 = Quarterfinals, 4 = Preliminaries):

**Teams table** (formerly `result_teams`)

| Field        | Type      | Description                          |
| ------------ | --------- | --------------------------------------- |
| id           | uuid      | Random GUID, primary key                 |
| division_id    | uuid      | Foreign key to divisions                          |
| round_number | integer   | Round number                             |
| pool_id      | text      | Pool label (e.g. "A")                    |
| place        | integer   | Result: placement within the pool once it has played |
| points       | integer   | Points earned                            |
| play_order   | integer   | Order the team plays within its pool (1 = first), nullable |

**Pool judges table**

| Field         | Type | Description                                                   |
| ------------- | ---- | ------------------------------------------------------------- |
| id            | uuid | Random GUID, primary key                                      |
| division_id   | uuid | Foreign key to divisions                                      |
| round_number  | integer | Round number (same numbering as teams)                     |
| pool_id       | text | Pool label (same as teams, e.g. "poolA")                      |
| player_id     | uuid | Foreign key to players: the judge                             |
| category_type | text | What they judge: Diff, AI or Ex (Goe rules: GoeDiff, GoeTech, GoeSub); one per player per pool |

**Event play state table** (the Head Judge tool's live state; one row per event)

| Field              | Type        | Description                                              |
| ------------------ | ----------- | -------------------------------------------------------- |
| event_id           | uuid        | Primary key, foreign key to events                       |
| division_id        | uuid        | The playing pool's division (foreign key to divisions)   |
| round_number       | integer     | The playing pool's round                                 |
| pool_id            | text        | The playing pool (e.g. "poolA")                          |
| team_id            | uuid        | The team that is up (foreign key to teams)               |
| routine_started_at | timestamptz | When the first throw was clicked; null = not started     |
| routine_id         | uuid        | The running routine (foreign key to routines); null = none |
| updated_at         | timestamptz | Last change                                              |

**Judging presets table** (named copies of one judging system's settings, shared across events)

| Field      | Type        | Description                                                  |
| ---------- | ----------- | ------------------------------------------------------------ |
| id         | uuid        | Random GUID, primary key                                     |
| rules_id   | text        | The judging system it belongs to (Fpa2020, Fpa2027, ...)     |
| name       | text        | Preset name, unique per system ignoring case                 |
| settings   | jsonb       | That system's values, all categories                         |
| created_at | timestamptz | When it was first saved                                      |
| updated_at | timestamptz | Last replaced                                                |

**Routines table** (one row per performance: a team playing once in a pool; created when the Head Judge starts the routine)

| Field        | Type        | Description                                                       |
| ------------ | ----------- | ----------------------------------------------------------------- |
| id           | uuid        | Random GUID, primary key                                          |
| event_id     | uuid        | Foreign key to events                                             |
| division_id  | uuid        | Foreign key to divisions (nullable)                               |
| round_number | integer     | Round (same numbering as teams)                                   |
| pool_id      | text        | Pool label (e.g. "poolA")                                         |
| team_id      | uuid        | The team that played (foreign key to teams, nullable: teams are edited) |
| started_at   | timestamptz | When the timer started                                            |
| ended_at     | timestamptz | When it was cancelled or finished (nullable)                      |
| status       | text        | running, cancelled or finished; cancelled routines are left out of statistics |
| created_at   | timestamptz | When the row was created                                          |

**Routine players table** (who competed in a routine, fixed when it starts; aliases resolved to the main player)

| Field      | Type | Description                                 |
| ---------- | ---- | ------------------------------------------- |
| routine_id | uuid | Foreign key to routines (part of the primary key) |
| player_id  | uuid | Foreign key to players (part of the primary key)  |

**Fpa2027 judge notes table** (what a judge pressed during a routine on the public judge screens)

| Field         | Type        | Description                                              |
| ------------- | ----------- | -------------------------------------------------------- |
| id            | uuid        | Primary key, made by the judge's screen (a resend is stored once) |
| routine_id    | uuid        | Foreign key to routines                                  |
| event_id      | uuid        | Foreign key to events                                    |
| player_id     | uuid        | Foreign key to players: the judge                        |
| category_type | text        | Diff, AI or Ex                                           |
| note_type     | text        | Execution: large_error, medium_error, minor_error, average_completion, clean_completion. Artistic Impression: teamwork_*, music_*, form_*. Difficulty: bad, average, good (the rating) |
| line_position | numeric     | Difficulty only: where the judge tapped on the numberline, 0 (bottom) to 1 (top) |
| line_value    | numeric     | Difficulty only: the numberline score, line_position x the line's range at the time |
| multiplier    | numeric     | Difficulty only: the rating's multiplier at the time (points = line_value x multiplier) |
| noted_at      | timestamptz | When the judge pressed, on the server's clock            |

A note counts for every player in `routine_players` of its routine. `fpa2027_judge_note_counts` is a view of counts per routine, judge, category and note type (and, for Difficulty, the sum of points).

**Fpa2027 judge scores table** (the score a judge submits: one per routine, judge and category)

| Field             | Type        | Description                                                |
| ----------------- | ----------- | ---------------------------------------------------------- |
| id                | uuid        | Random GUID, primary key                                   |
| routine_id        | uuid        | Foreign key to routines                                    |
| judge_player_id   | uuid        | Foreign key to players: the judge                          |
| category_type     | text        | Diff, AI or Ex                                             |
| baseline_estimate | numeric     | What the computer suggested, worked out on the server from the notes |
| adjust_percent    | numeric     | The judge's change to it, in percent                       |
| score             | numeric     | The final score                                            |
| settings          | jsonb       | The weights and estimate settings used                     |
| submitted_at      | timestamptz | When it was submitted                                      |

A judge's notes for a routine are locked once they submit.

**Team players table** (formerly `result_team_players`)

| Field           | Type | Description               |
| --------------- | ---- | ---------------------------- |
| id              | uuid | Random GUID, primary key      |
| team_id  | uuid | Foreign key to teams             |
| player_id       | uuid | Foreign key to players                  |

**Rankings table**

Summary data of ranking

| Field         | Type    | Description                                       |
| ------------- | ------- | ---------------------------------------------------- |
| id            | uuid    | Random GUID, primary key                              |
| category      | text    | Ranking category (e.g. "ranking-open")                 |
| publish_date | date | Date of the rankings          |

**Ranking points table**

One row per player per rankings

| Field       | Type    | Description                     |
| ----------- | ------- | ----------------------------------- |
| id          | uuid    | Random GUID, primary key             |
| ranking_id  | uuid    | Foreign key to Rankings table                 |
| player_id     | uuid    | Foreign key to players                                          |
| points      | numeric | Points earned from this result         |



### List of APIs

# Frontend

- **Judging tools**
  - Head Judge
  - Judge Interfaces
  - Event Creator
  - Simple Rank Version
- **Data tools**
  - **Player Editor** — search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker (login required)
  - Events
  - Ranking
- **Public tools**
  - Results Viewer
  - Rankings Viewer

# Running a local server at an event

At an event the devices share a hotspot with only a weak link to the internet. The Head Judge runs the app on a laptop with its own Postgres; the judges' phones open the laptop's address and never touch the internet. The laptop syncs with Neon in the background.

**One-time setup on the laptop**

1. Install Postgres, create an empty database (e.g. `freestyle_local`).
2. In `web/.env.local` add `LOCAL_DATABASE_URL=postgresql://postgres:password@localhost:5432/freestyle_local` and `AUTH_TRUST_HOST=true`. Keep the same `AUTH_SECRET` as Neon so a Head Judge login stays valid.
3. `cd web && npm install && npm run local:setup` (creates the tables in the local database; safe to repeat).
4. `npm run build`, then `npm run start:local`. It prints the addresses judges open, and the Head Judge page shows them with a QR code.

**At the event**

- Sign in on the laptop, open Head Judge, and click the database pill next to *Control Panel*. Choose the event, **Take event offline** (downloads it), then switch to **Local server**. Switch between routines: every screen changes at once.
- Judges scan the QR code (or open `http://<laptop address>:3000`) and pick their seat as usual. Their Play tab dots show who is connected. While on Local the Head Judge and judge screens poll every second.
- Event setup (pools, teams, judges, players) is edited on Neon only and is pulled down when it changes. What judging creates (routines, notes, scores, play state, judging settings, presets) is made locally and pushed to Neon every 30 s (`LOCAL_SYNC_INTERVAL_SECONDS`). **Sync now** in the pill does it at once, and switching back to Postgres sends everything first.
- The local database is backed up to `web/.local/backups` before anything in it is replaced (`npm run local:restore` lists them, `npm run local:restore -- <file>` restores one; stop the server first).
- Google/Discord sign-in needs the internet: on the laptop use the email and password login (the account is copied down with the event).

**If a phone can't reach the laptop:** allow the app through Windows Firewall for the hotspot network (it may be classed Public); make sure the hotspot has client/AP isolation off; use the address shown in the pill (the `.local` name is a backup for when the IP changes).

# Ideas

- Auth for everything
- Roles to control permissions
- Discord integration
- Claude chat support
- Easy handoff
