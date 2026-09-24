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
| category_type | text | What they judge (e.g. Diff, Variety, ExAi); unique per player per pool |

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
  - Head judge
  - Judge interfaces
  - Event creator
  - Simple rank version
- **Data tools**
  - **Player editor** — search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker (login required)
  - Events
  - Ranking
- **Public tools**
  - Results viewer
  - Rankings viewer

# Ideas

- Run local server for events
- Auth for everything
- Roles to control permissions
- Discord integration
- Claude chat support
- Easy handoff
