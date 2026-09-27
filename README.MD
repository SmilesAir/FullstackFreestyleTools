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

All public endpoints are read-only `GET`s that answer CORS (`Access-Control-Allow-Origin: *`, with an `OPTIONS` preflight), are rate limited, and cache well: `Cache-Control: public, max-age=60, s-maxage=600, stale-while-revalidate=3600`, so most requests are served by the CDN and a new publish shows within about 10 minutes.

**Points API** (feeds [ResultsRender](https://github.com/SmilesAir/ResultsRender); the same five calls and JSON shapes as PointsService and its sibling services), under `/api/v1/points/`:

| Endpoint | Returns |
|---|---|
| `getManifest` | `{ manifest: { "<type>-<division>_<date>": { key, date, divisionName, createdAt, dataPath, isHidden } } }`, one entry per published `ranking-open`, `ranking-women` and `rating-open` per date (e.g. `ranking-open_2026-9-25`) |
| `downloadPointsData/{key}` | `{ data: [...] }`: ranking rows `{ id, fullName, rank, points, resultsCount, pointsList: [{ resultsId, points }] }` or rating rows `{ id, fullName, rating, matchCount, highestRating, highestRatingDate, highestRank, highestRankDate }`; 404 for an unknown key |
| `getAllResults` | `{ results: { [resultsId]: { eventName, divisionName, ... } } }`: every division that has placed teams (`resultsId` is the division id used in the rankings' `pointsList`) |
| `getAllEvents` | `{ allEventSummaryData: { [eventId]: { eventName, startDate, endDate } } }` |
| `getAllPlayers` | `{ players: { [playerId]: { firstName, lastName } } }` for the players in published rankings and ratings |

To point ResultsRender at this app, change the URL map in its `client/source/endpoints.js` (production and development) to:

```js
const base = "https://<this site>/api/v1/points"
GET_PLAYER_DATA:     `${base}/getAllPlayers`,
GET_EVENT_DATA:      `${base}/getAllEvents`,
GET_RESULTS_DATA:    `${base}/getAllResults`,
GET_POINTS_MANIFEST: `${base}/getManifest`,
GET_POINTS_DATA:     `${base}/downloadPointsData/<key>`,
```

**Rankings API** (existing): `GET /api/v1/rankings?category=ranking-open&page=1&country=` gives the live ranking (the one the last publish put there).

**Rate limits** (one results-page view is about 8 calls, and normal traffic is about 3,000 calls a month): per IP 30 calls per minute, per IP 500 per day, and 10,000 per 30 days for everyone together. All three are settings on the admin Settings page. A refused call is HTTP 429 with `Retry-After`; every answer carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` for the tightest window. The limits are counted in one query per call.

### Rankings Generator

`/rankings-generator` (permission *Rankings Generator*) replaces PointsService's manual page. **Events**: every event with played divisions, newest first, one button for the last 2 years, any event or division can be ticked off. **Settings**: every constant of the calculation (K for open and women, major and worlds bonuses and their event names, results counted per player, the divisions that count, the ratings' K factors, starting rating and the rest), edited live and savable as the defaults. **Preview**: the open and women rankings and the open ratings for the current selection and settings. **Published**: publish a version (open and women rankings and open ratings, stored with the settings used), hide or delete versions. Publishing also replaces the live rankings the Event Creator seeds from. Ratings always use every event.

It reproduces PointsService's calculation (checked with `node scripts/verify-points.cjs`, which runs the library on `Planning/AllFrisbeeData-*.json` and compares with that service's own published output: the women's ranking, the open ranking and the ratings agree apart from what was edited after they were published). Deliberate differences: the ratings' major and worlds K factors are the intended 48 and 64 (PointsService's code swapped them; set 64 and 48 to reproduce its numbers), and hidden divisions are left out of both. Rounds are read in PointsService's order (the Finals, then the earliest round on) unless the *Round order* setting is changed.

### Results Parser

`/results-parser` (permission *Results Parser*) enters the results of events that ran outside the system, the way EventResultsService's enter-results widget did. Pick an event (or create one) and a division, then add rounds, pools, teams, places and players, or paste the results into **Fill from Claude** and check what it filled in. Claude reads the text with the Anthropic API key from Settings (the same one the Event Creator uses), each name is matched against the players (unsure or unknown names are flagged, with a button to create a new player), and nothing is saved until **Save results**. Places run per pool, 1, 2, 3 (a tie repeats the number, 1, 1, 3), and the editor shows what is wrong before it lets you save. Saving replaces that division's results and publishes them, so the Rankings Generator counts them; **Hide it** takes them back out. Unsaved work is kept in the browser. It needs the server on Postgres (Neon), not the local database. `node scripts/verify-results-parser.cjs` checks the validation rules and the mapping of Claude's answer.

### Claude integration (Settings)

The admin Settings page has a **Claude integration** section: the Anthropic API key, **every prompt** the app sends to Claude (its use, model, effort, output limit and the full system prompt), and **what the calls have cost** (this month, the last 30 days, all time, per prompt, plus the last 20 calls with who made them and how each ended). The prompts live in `web/lib/claude-prompts.ts` and the three call sites read them from there, so the page shows exactly what is sent; the list is read-only. Cost comes from the app's own log (`claude_usage`, one row per billed call: the tokens Anthropic reports for the call times the list price in `web/lib/claude-pricing.ts`, worked out when the call is made), so it is an estimate and the Anthropic Console is the actual bill. Calls before the log existed are not counted, and a call made while the server runs on the local database is logged there. The log is left out of backups on purpose, so restoring an old backup never erases the history. To add a model or change a price, edit `MODEL_PRICES`; `node scripts/verify-claude-usage.cjs` checks the arithmetic and the prompt list.

### Simple Ranking

A division on **Simple Ranking** rules (the Event Creator's Rules dropdown) has no assigned judges: anyone can rank it from a **Judge** button on the main landing page, next to the assigned-judge buttons, whenever the event is turned on. Each judge puts the playing pool's teams in order from best to worst on their phone — up and down arrows always swap two teams' ranks (never just change a number), and an unranked team is inserted 1st (up) or 2nd (down); the ranks in use are always 1, 2, 3 … with no repeats. **Submit** unlocks once every team has a rank. The judge isn't identified: a random id kept in that browser is one ranking per pool, so re-sending replaces it rather than counting twice. The best team gets 1 point, the next 2, and so on; the team with the fewest points wins, and a tie goes to the team that plays later (see `sortPoolTeams` in `web/lib/event-creator-layout.ts`). The Head Judge's Results tab shows, for a Simple Ranking pool, how many judges sent a ranking, each team's count of every place it received, its total and final place (a tie marked "won on seed"), and a **Clear rankings** button. The rules are pure and unit-tested in `web/lib/simple-ranking.ts` (`node scripts/verify-simple-ranking.cjs`, including 2,000 random arrow presses that never produce a repeated or missing rank); ballots are stored in `simple_ranking_ballots` and sync from a local server to Neon like the Fpa2027 scores.

### Pool locking

Each pool (a division's round + letter) has a **Lock**/**Unlock** button on the Head Judge's Pools tab. While locked, that pool's scores and notes, its teams (layout, add/remove, re-seeding, clearing the round) and its judges can't be changed — enforced on the server everywhere those are written, including from the Event Creator, so it isn't just a hidden button. Starting a routine in a locked pool is refused too (a routine is what notes and scores attach to), and locking itself is refused while a routine is running in that exact pool; unlocking is never refused. The Event Creator greys out a locked pool's controls with a 🔒 tag, and the Head Judge's Play tab shows a banner and disables Start while the playing pool is locked. The state lives in a generic `pools` table (one row per division/round/letter, `locked boolean`), left room for other pool-level settings later, and syncs from a local server to Neon like the play state.

### Public results permalinks

Every pool has a public, no-login permalink — a short code, not its ids (`freestylejudge.com/r/Yx7Kp2Qm`), generated the first time it's needed and fixed after that. A **Publish**/**Unpublish** toggle and the link itself (with Copy/View) sit at the top of that pool's results in the Head Judge, and the Pools tab shows a "📢 Published" badge alongside "🔒 Locked" (independent toggles — publishing doesn't require locking). The permalink itself never changes: before publishing it shows only the teams (play order) and the judges by name; after publishing, the full results, but a judge is never named — only "Difficulty #1", "Artistic Impression #2" and so on (Simple Ranking has no judges to name either way, being anonymous already). The page has Division/Round/Pool dropdowns to browse to any other pool of the event (browsing is open; only the results themselves are gated by publishing). The anonymization happens server-side in `web/lib/public-results.ts`, which is the page's only data source — a real judge name or id is never read into a value the page receives. The short code lives in the same `pools` table (`short_code text`, `results_published boolean`).


# Frontend

- **Judging tools**
  - Head Judge
  - Judge Interfaces
  - Event Creator — a new event starts with no divisions; add each one from its Rules type as needed, and it's published straight away. Teams can be pasted in any format for one division (its *Add teams* section) or for several divisions at once (the selected event's *Add teams to several divisions with Claude*, e.g. a spreadsheet with a heading row per division); Claude sorts them, names are matched to players, and any division the event doesn't have yet is created for it
  - Simple Rank Version — anonymous judges rank the playing pool from the main landing page's Judge button (see below)
- **Data tools**
  - **Player Editor** — search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker (login required)
  - Events
  - Results Parser — enter results from events run outside the system, with Claude filling the form from pasted text (see below)
  - Rankings Generator — choose events, tune the settings, preview and publish the rankings and ratings (see below)
- **Public tools**
  - Results Viewer — a pool's public permalink (see above): a short code, no login, browsable by Division/Round/Pool
  - Rankings Viewer

# Running a local server at an event

At an event the devices share a hotspot with only a weak link to the internet. The Head Judge runs the app on a laptop with its own Postgres; the judges' phones open the laptop's address and never touch the internet. The laptop syncs with Neon in the background.

**One-time setup on the laptop**

1. **Install Postgres** ([download](https://www.postgresql.org/download/); on Windows use the EDB installer). Keep the default port 5432 and remember the `postgres` password you choose. You don't need to create a database: the app does that.
2. **Create the local database from the page.** Sign in **on the laptop itself** (`http://localhost:3000`, not its network address), open Head Judge, click the database pill, and in **Local database** open **Create the database and a login for me**. Enter the Postgres admin password and click **Create database and login**. In one step it:
   - makes a login just for this app (default `freestyle`, no admin rights) and a database it owns (default `freestyle_local`),
   - creates the tables (from `backend/schema.sql`),
   - saves the address, which uses that login and a generated password, so the saved address never holds the admin password.

   The admin password is used once, in memory, and never stored. Running it again is safe (it resets the login's password and saves the new address). *Advanced* lets you change the admin user, host and port.

Run the app on the laptop as usual. `npm run start:local` (after `npm run build`) also prints the addresses judges open and makes sure the app is reachable from the hotspot; the Head Judge page shows those addresses too, with a QR code.

**Already have a database, or prefer the terminal?** In **Local database** enter its address (e.g. `postgresql://user:password@localhost:5432/freestyle_local`), then **Test connection**, **Save** and **Set up tables**. Or put `LOCAL_DATABASE_URL=...` in `web/.env.local` and run `npm run local:setup`. An address saved on the page wins over the environment variable. The address must be on this computer or its local network.

**Where things are kept on the laptop**

| What | Where |
|---|---|
| The local database and its login | In Postgres (database `freestyle_local`, login `freestyle` unless you chose other names) |
| The saved address (with the login's generated password), which database is in use, the event downloaded, the last sync | `web/.local/db-mode.json` (only on this computer, ignored by git) |
| Safety backups of the local database, taken before anything in it is replaced (newest 20 kept) | `web/.local/backups/` |
| What was last sent to Neon (so each sync only sends what changed) | A small `local_sync_state` table inside the local database |

**At the event**

- Sign in on the laptop, open Head Judge, and click the database pill next to *Control Panel*. Choose the event, **Take event offline** (downloads it), then switch to **Local server**. Switch between routines: every screen changes at once.
- Judges scan the QR code (or open `http://<laptop address>:3000`) and pick their seat as usual. Their Play tab dots show who is connected. While on Local the Head Judge and judge screens poll every second.
- Event setup (pools, teams, judges, players) is edited on Neon only and is pulled down when it changes. What judging creates (routines, notes, scores, play state, judging settings, presets) is made locally and pushed to Neon every 30 s (`LOCAL_SYNC_INTERVAL_SECONDS`). **Sync now** in the pill does it at once, and switching back to Postgres sends everything first.
- `npm run local:restore` lists the safety backups and `npm run local:restore -- <file name>` restores one (stop the server first).
- Google/Discord sign-in needs the internet: on the laptop use the email and password login (the account is copied down with the event).

**Starting over (back to a fresh laptop)**

1. Switch to **Postgres (Neon)** in the pill, then stop the server.
2. Drop the database and login in Postgres, e.g. in `psql -U postgres`: `DROP DATABASE freestyle_local WITH (FORCE); DROP ROLE freestyle;`
3. Delete the `web/.local` folder (this forgets the saved address, the downloaded event and the backups).
4. Start the server and repeat step 2 above.

Nothing on Neon is touched by any of this. Unsent local changes are lost if you drop the database first, so check the pill says nothing is waiting to send.

**If a phone can't reach the laptop:** allow the app through Windows Firewall for the hotspot network (it may be classed Public); make sure the hotspot has client/AP isolation off; use the address shown in the pill (the `.local` name is a backup for when the IP changes). If the page loads on the phone but never updates and nothing can be pressed, the server is `next dev` blocking other devices: `web/next.config.ts` already allows local network addresses (restart the server after changing it), and `npm run start:local` (after `npm run build`) has no such check.

# Ideas

- Auth for everything
- Roles to control permissions
- Discord integration
- Claude chat support
- Easy handoff
