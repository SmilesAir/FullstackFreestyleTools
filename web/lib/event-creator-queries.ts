import 'server-only';
import { pool } from './db';
import { ROSTER_ROUND, type PoolConfig } from './event-creator';

export type EventListItem = {
  id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  division_count: string;
};

export async function listEvents(): Promise<EventListItem[]> {
  const result = await pool.query<EventListItem>(
    `SELECT e.id, e.event_name, e.start_date::text, e.end_date::text,
            (SELECT count(*) FROM divisions d WHERE d.event_id = e.id) AS division_count
     FROM events e
     ORDER BY e.start_date DESC
     LIMIT 100`
  );
  return result.rows;
}

export async function getEvent(id: string) {
  const result = await pool.query<{ id: string; event_name: string; start_date: string; end_date: string }>(
    'SELECT id, event_name, start_date::text, end_date::text FROM events WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export type EventPlayer = { id: string; name: string; country: string | null; divisions: string[] };

// Every player on any team in the event, once each, with the divisions they're in.
export async function getEventPlayers(eventId: string): Promise<EventPlayer[]> {
  const result = await pool.query<{
    id: string;
    first_name: string;
    last_name: string;
    country: string | null;
    divisions: string[];
  }>(
    `SELECT p.id, p.first_name, p.last_name, p.country,
            array_agg(DISTINCT d.division_name ORDER BY d.division_name) AS divisions
     FROM divisions d
     JOIN teams t ON t.division_id = d.id
     JOIN team_players tp ON tp.team_id = t.id
     JOIN players p ON p.id = tp.player_id
     WHERE d.event_id = $1
     GROUP BY p.id
     ORDER BY p.last_name, p.first_name`,
    [eventId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    country: r.country,
    divisions: r.divisions,
  }));
}

export type DivisionListItem = {
  id: string;
  division_name: string;
  is_hidden: boolean | null;
  rules_id: string;
  team_count: string;
};

export async function listDivisions(eventId: string): Promise<DivisionListItem[]> {
  const result = await pool.query<DivisionListItem>(
    `SELECT d.id, d.division_name, d.is_hidden, d.rules_id,
            count(t.id) FILTER (WHERE t.round_number = $2) AS team_count
     FROM divisions d LEFT JOIN teams t ON t.division_id = d.id
     WHERE d.event_id = $1
     GROUP BY d.id
     ORDER BY d.division_name`,
    [eventId, ROSTER_ROUND]
  );
  return result.rows;
}

export type PoolJudgeRow = {
  round_number: number;
  pool_id: string;
  player_id: string;
  name: string;
  category_type: string;
};

// Every judge assigned to a pool of the division, with their names.
export async function getPoolJudges(divisionId: string): Promise<PoolJudgeRow[]> {
  const result = await pool.query<{
    round_number: number;
    pool_id: string;
    player_id: string;
    first_name: string;
    last_name: string;
    category_type: string;
  }>(
    `SELECT j.round_number, j.pool_id, j.player_id, p.first_name, p.last_name, j.category_type
     FROM pool_judges j JOIN players p ON p.id = j.player_id
     WHERE j.division_id = $1
     ORDER BY p.last_name, p.first_name`,
    [divisionId]
  );
  return result.rows.map((r) => ({
    round_number: r.round_number,
    pool_id: r.pool_id,
    player_id: r.player_id,
    name: `${r.first_name} ${r.last_name}`,
    category_type: r.category_type,
  }));
}

export type PlayerRef = { id: string; name: string; country: string | null };

export type DivisionDetail = {
  id: string;
  event_id: string;
  event_name: string;
  division_name: string;
  is_hidden: boolean | null;
  rules_id: string;
  routine_seconds: number;
  pool_config: PoolConfig;
  head_judge: PlayerRef | null;
  directors: PlayerRef[];
};

export async function getDivision(id: string): Promise<DivisionDetail | null> {
  const result = await pool.query<{
    id: string;
    event_id: string;
    event_name: string;
    division_name: string;
    is_hidden: boolean | null;
    rules_id: string;
    routine_seconds: number;
    pool_config: PoolConfig;
    head_judge_player_id: string | null;
    director_player_ids: string[];
  }>(
    `SELECT d.id, d.event_id, e.event_name, d.division_name, d.is_hidden, d.rules_id, d.routine_seconds, d.pool_config,
            d.head_judge_player_id, d.director_player_ids
     FROM divisions d JOIN events e ON e.id = d.event_id
     WHERE d.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;

  const ids = [...row.director_player_ids, ...(row.head_judge_player_id ? [row.head_judge_player_id] : [])];
  const players = ids.length ? await getPlayerRefs(ids) : new Map<string, PlayerRef>();

  return {
    id: row.id,
    event_id: row.event_id,
    event_name: row.event_name,
    division_name: row.division_name,
    is_hidden: row.is_hidden,
    rules_id: row.rules_id,
    routine_seconds: row.routine_seconds,
    pool_config: row.pool_config ?? {},
    head_judge: row.head_judge_player_id ? (players.get(row.head_judge_player_id) ?? null) : null,
    directors: row.director_player_ids.map((pid) => players.get(pid)).filter((p): p is PlayerRef => !!p),
  };
}

export async function getPlayerRefs(ids: string[]): Promise<Map<string, PlayerRef>> {
  if (ids.length === 0) return new Map();
  const result = await pool.query<{ id: string; first_name: string; last_name: string; country: string | null }>(
    'SELECT id, first_name, last_name, country FROM players WHERE id = ANY($1)',
    [ids]
  );
  return new Map(
    result.rows.map((r) => [r.id, { id: r.id, name: `${r.first_name} ${r.last_name}`, country: r.country }])
  );
}

export type TeamRow = {
  id: string;
  round_number: number;
  pool_id: string;
  // Result once the pool has played; NULL until then.
  place: number | null;
  // Order the team plays within its pool; NULL until someone arranges the pool.
  play_order: number | null;
  players: PlayerRef[];
  points: number;
};

// Every team row for a division (roster + all seeded rounds), with players
// and ranking-derived points, in a single round trip (each trip to the DB is
// ~100ms, so folding the rankings lookup in here saves a whole wave).
export async function getTeams(divisionId: string, divisionName: string): Promise<TeamRow[]> {
  const rows = await pool.query<{
    team_id: string;
    round_number: number;
    pool_id: string;
    place: number | null;
    play_order: number | null;
    player_id: string | null;
    first_name: string | null;
    last_name: string | null;
    country: string | null;
    gender: string | null;
    open_points: string | null;
    women_points: string | null;
  }>(
    `SELECT t.id AS team_id, t.round_number, t.pool_id, t.place, t.play_order,
            p.id AS player_id, p.first_name, p.last_name, p.country, p.gender,
            (SELECT max(r.points) FROM rankings r WHERE r.player_id = p.id AND r.category = 'ranking-open') AS open_points,
            (SELECT max(r.points) FROM rankings r WHERE r.player_id = p.id AND r.category = 'ranking-women') AS women_points
     FROM teams t
     LEFT JOIN team_players tp ON tp.team_id = t.id
     LEFT JOIN players p ON p.id = tp.player_id
     WHERE t.division_id = $1
     ORDER BY p.last_name, p.first_name`,
    [divisionId]
  );

  const teams = new Map<string, TeamRow>();
  for (const r of rows.rows) {
    let team = teams.get(r.team_id);
    if (!team) {
      team = {
        id: r.team_id,
        round_number: r.round_number,
        pool_id: r.pool_id,
        place: r.place,
        play_order: r.play_order,
        players: [],
        points: 0,
      };
      teams.set(r.team_id, team);
    }
    if (r.player_id) {
      team.players.push({ id: r.player_id, name: `${r.first_name} ${r.last_name}`, country: r.country });
      team.points += playerPoints(divisionName, r.gender, Number(r.open_points ?? 0), Number(r.women_points ?? 0));
    }
  }
  return [...teams.values()];
}

// Ported from the old Event Creator's getPlayerRankingPointsByDivision:
// Women Pairs counts only women (ranking-women); Mixed Pairs uses
// ranking-women for women and ranking-open for everyone else; everything
// else is ranking-open.
function playerPoints(divisionName: string, gender: string | null, open: number, women: number): number {
  const female = gender === 'F';
  if (divisionName === 'Women Pairs') return female ? women : 0;
  if (divisionName === 'Mixed Pairs' && female) return women;
  return open;
}
