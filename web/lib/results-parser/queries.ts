import 'server-only';
import { pool } from '../db';
import { newKey, type EventOption, type LoadedDivision, type EditorRound } from './types';

// Every event, newest first (the picker needs old ones too, unlike the Event Creator's list).
export async function listEventOptions(): Promise<EventOption[]> {
  const result = await pool.query<EventOption>(
    'SELECT id, event_name, start_date::text, end_date::text FROM events ORDER BY start_date DESC, event_name'
  );
  return result.rows;
}

// A division's saved results (the rounds, not the round-0 roster), or none yet.
export async function getDivisionResults(eventId: string, divisionName: string): Promise<LoadedDivision> {
  const division = await pool.query<{ id: string; is_hidden: boolean | null }>(
    'SELECT id, is_hidden FROM divisions WHERE event_id = $1 AND division_name = $2',
    [eventId, divisionName]
  );
  if (!division.rows[0]) return { divisionId: null, isHidden: null, rounds: [] };
  const { id, is_hidden } = division.rows[0];

  const rows = await pool.query<{
    team_id: string;
    round_number: number;
    pool_id: string;
    place: number | null;
    player_id: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT t.id AS team_id, t.round_number, t.pool_id, t.place, p.id AS player_id, p.first_name, p.last_name
     FROM teams t
     LEFT JOIN team_players tp ON tp.team_id = t.id
     LEFT JOIN players p ON p.id = tp.player_id
     WHERE t.division_id = $1 AND t.round_number >= 1
     ORDER BY t.round_number, t.pool_id, t.place NULLS LAST, t.play_order NULLS LAST, t.id, p.last_name, p.first_name`,
    [id]
  );

  const rounds = new Map<number, Map<string, Map<string, { place: number | null; players: { id: string; name: string }[] }>>>();
  for (const r of rows.rows) {
    const pools = rounds.get(r.round_number) ?? new Map();
    rounds.set(r.round_number, pools);
    const letter = r.pool_id.replace(/^pool/i, '').toUpperCase();
    const teams = pools.get(letter) ?? new Map();
    pools.set(letter, teams);
    const team = teams.get(r.team_id) ?? { place: r.place, players: [] };
    teams.set(r.team_id, team);
    if (r.player_id) team.players.push({ id: r.player_id, name: `${r.first_name} ${r.last_name}` });
  }

  const editor: EditorRound[] = [...rounds.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, pools]) => ({
      round,
      pools: [...pools.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([letter, teams]) => ({
          letter,
          teams: [...teams.entries()].map(([, t]) => ({
            key: newKey(),
            place: t.place,
            players: t.players.map((p) => ({ id: p.id, name: p.name })),
          })),
        })),
    }));

  return { divisionId: id, isHidden: is_hidden, rounds: editor };
}
