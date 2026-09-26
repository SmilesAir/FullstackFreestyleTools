import 'server-only';
import { pool } from '../db';
import type { EventInput, PlayerMap, PlayerRecord } from './types';

// Reads what the calculations need from the database, in a few set-based queries.

export async function loadPlayers(): Promise<PlayerMap> {
  const result = await pool.query<{ id: string; first_name: string; last_name: string; alias_id: string | null; gender: string | null }>(
    `SELECT id, first_name, last_name, alias_id, gender FROM players`
  );
  const players = new Map<string, PlayerRecord>();
  for (const row of result.rows) {
    players.set(row.id, { id: row.id, firstName: row.first_name, lastName: row.last_name, aliasId: row.alias_id, gender: row.gender });
  }
  return players;
}

type TeamRow = {
  event_id: string;
  division_id: string;
  division_name: string;
  created_ms: string;
  round_number: number;
  place: number;
  players: string[];
};

// Every event that has at least one played division, with its divisions' results.
// A team's players are listed in a fixed order (by id), so the same team is recognised as one in every
// round it played (the ratings tell teams apart by their players).
// A division counts once it has teams with a place in round 1 or later (round 0 is the
// unseeded roster); hidden divisions are left out. Events are in start-date order.
export async function loadEvents(): Promise<EventInput[]> {
  const [events, teams] = await Promise.all([
    pool.query<{ id: string; event_name: string; start_date: string; start_ms: string }>(
      `SELECT id, event_name, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              (extract(epoch FROM start_date) * 1000)::float8 AS start_ms
       FROM events ORDER BY start_date, created_at, id`
    ),
    pool.query<TeamRow>(
      `SELECT d.event_id, d.id AS division_id, d.division_name,
              (extract(epoch FROM d.created_at) * 1000)::float8 AS created_ms,
              t.round_number, t.place,
              COALESCE(array_agg(tp.player_id ORDER BY tp.player_id) FILTER (WHERE tp.player_id IS NOT NULL), '{}') AS players
       FROM divisions d
       JOIN teams t ON t.division_id = d.id
       LEFT JOIN team_players tp ON tp.team_id = t.id
       WHERE t.round_number >= 1 AND t.place IS NOT NULL AND COALESCE(d.is_hidden, false) = false
       GROUP BY d.id, t.id
       ORDER BY d.id, t.round_number, t.pool_id, t.place, t.play_order NULLS LAST, t.id`
    ),
  ]);

  const byEvent = new Map<string, EventInput>();
  for (const row of events.rows) {
    byEvent.set(row.id, { id: row.id, name: row.event_name, startDate: row.start_date, startMs: Number(row.start_ms), results: [] });
  }

  const divisions = new Map<string, EventInput['results'][number]>();
  for (const row of teams.rows) {
    const event = byEvent.get(row.event_id);
    if (!event) continue;
    let division = divisions.get(row.division_id);
    if (!division) {
      division = {
        id: row.division_id,
        eventId: row.event_id,
        eventName: event.name,
        divisionName: row.division_name,
        createdAt: Number(row.created_ms),
        rounds: [],
      };
      divisions.set(row.division_id, division);
      event.results.push(division);
    }
    let round = division.rounds.find((r) => r.round === row.round_number);
    if (!round) {
      round = { round: row.round_number, teams: [] };
      division.rounds.push(round);
    }
    round.teams.push({ players: row.players, place: row.place });
  }
  return [...byEvent.values()].filter((event) => event.results.length > 0);
}

// What the Events tab lists: every event with played divisions, each division with its
// name and how many teams placed.
export type GeneratorEvent = {
  id: string;
  name: string;
  startDate: string;
  divisions: { id: string; name: string; teams: number }[];
};

export async function listGeneratorEvents(): Promise<GeneratorEvent[]> {
  const events = await loadEvents();
  return events.map((event) => ({
    id: event.id,
    name: event.name,
    startDate: event.startDate,
    divisions: event.results.map((division) => ({
      id: division.id,
      name: division.divisionName,
      teams: division.rounds.reduce((n, round) => n + round.teams.length, 0),
    })),
  }));
}
