import 'server-only';
import { pool } from './db';
import { roundName } from './head-judge';
import {
  JUDGING_CATEGORIES,
  categoryByType,
  type JudgeNote,
  type JudgeState,
  type JudgingCategory,
  type JudgingEvent,
} from './judging';

// These are public on purpose: judges reach them without logging in, so nothing
// here checks a permission and nothing beyond a judge's name is returned.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = JUDGING_CATEGORIES.map((c) => c.type);

type Row = { event_id: string; event_name: string; player_id: string; first_name: string; last_name: string; category_type: string };

// Judges of the pool that is playing, for each event that is turned on. An event
// with no playing pool, or a playing pool without judges, isn't returned.
export async function getJudgingEvents(): Promise<JudgingEvent[]> {
  const result = await pool.query<Row>(
    `SELECT e.id AS event_id, e.event_name, p.id AS player_id, p.first_name, p.last_name, j.category_type
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN pool_judges j ON j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
     JOIN players p ON p.id = j.player_id
     WHERE e.is_playing AND j.category_type = ANY($1)
     ORDER BY e.start_date DESC, e.event_name, p.last_name, p.first_name`,
    [TYPES]
  );

  const events = new Map<string, JudgingEvent>();
  for (const r of result.rows) {
    const category = categoryByType(r.category_type);
    if (!category) continue;
    let event = events.get(r.event_id);
    if (!event) events.set(r.event_id, (event = { eventId: r.event_id, eventName: r.event_name, judges: [] }));
    event.judges.push({ playerId: r.player_id, name: `${r.first_name} ${r.last_name}`, category });
  }

  const order = (c: JudgingCategory) => JUDGING_CATEGORIES.indexOf(c);
  for (const event of events.values()) {
    // Stable sort: names stay in the query's order within a category.
    event.judges.sort((a, b) => order(a.category) - order(b.category));
  }
  return [...events.values()];
}

// "First Last / First Last" for the team's players.
const teamNameSql = (teamId: string) =>
  `(SELECT string_agg(p.first_name || ' ' || p.last_name, ' / ' ORDER BY p.last_name, p.first_name)
    FROM team_players tp JOIN players p ON p.id = tp.player_id WHERE tp.team_id = ${teamId})`;

// Everything a judge's screen shows while it polls: whether they are judging
// now, what is playing, the routine's start, and their own notes for the
// running routine (or, when none is running, for their most recent one).
export async function getJudgeState(eventId: string, playerId: string, categoryType: string): Promise<JudgeState> {
  const state = await pool.query<{
    round_number: number | null;
    pool_id: string | null;
    division_name: string | null;
    routine_seconds: number | null;
    team_name: string | null;
    started_ms: number | null;
    judging: boolean;
    now_ms: number;
  }>(
    `SELECT s.round_number, s.pool_id, d.division_name, d.routine_seconds,
            ${teamNameSql('s.team_id')} AS team_name,
            extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms,
            COALESCE(e.is_playing AND EXISTS (
              SELECT 1 FROM pool_judges j
              WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                AND j.player_id = $2 AND j.category_type = $3), false) AS judging,
            extract(epoch FROM now())::float8 * 1000 AS now_ms
     FROM (SELECT 1) one
     LEFT JOIN events e ON e.id = $1
     LEFT JOIN event_play_state s ON s.event_id = e.id
     LEFT JOIN divisions d ON d.id = s.division_id`,
    [eventId, playerId, categoryType]
  );
  const row = state.rows[0];
  const startedAt = row.started_ms === null ? null : Math.round(row.started_ms);
  const routineSeconds = row.routine_seconds ?? 180;

  let notesRoutine: JudgeState['notesRoutine'] = null;
  if (startedAt !== null) {
    notesRoutine = { startedAt, teamName: row.team_name, routineSeconds };
  } else {
    const latest = await pool.query<{ started_ms: number; routine_seconds: number; team_name: string | null }>(
      `SELECT extract(epoch FROM n.routine_started_at)::float8 * 1000 AS started_ms, d.routine_seconds,
              ${teamNameSql('n.team_id')} AS team_name
       FROM judge_notes n
       JOIN teams t ON t.id = n.team_id
       JOIN divisions d ON d.id = t.division_id
       WHERE n.event_id = $1 AND n.player_id = $2 AND n.category_type = $3
       ORDER BY n.routine_started_at DESC
       LIMIT 1`,
      [eventId, playerId, categoryType]
    );
    const r = latest.rows[0];
    if (r) notesRoutine = { startedAt: Math.round(r.started_ms), teamName: r.team_name, routineSeconds: r.routine_seconds };
  }

  let notes: JudgeNote[] = [];
  if (notesRoutine) {
    const found = await pool.query<{ id: string; note_type: string; noted_ms: number }>(
      `SELECT n.id, n.note_type, extract(epoch FROM n.noted_at)::float8 * 1000 AS noted_ms
       FROM judge_notes n
       WHERE n.event_id = $1 AND n.player_id = $2 AND n.category_type = $3
         AND n.routine_started_at = COALESCE(
           (SELECT routine_started_at FROM event_play_state WHERE event_id = $1),
           (SELECT max(routine_started_at) FROM judge_notes WHERE event_id = $1 AND player_id = $2 AND category_type = $3))
       ORDER BY n.noted_at, n.id`,
      [eventId, playerId, categoryType]
    );
    notes = found.rows.map((r) => ({ id: r.id, noteType: r.note_type, notedAt: Math.round(r.noted_ms) }));
  }

  const letter = row.pool_id?.replace(/^pool/, '') ?? null;
  return {
    serverNow: Math.round(row.now_ms),
    judging: row.judging,
    poolTitle:
      row.division_name && row.round_number !== null && letter
        ? `${row.division_name} · ${roundName(row.round_number)} · Pool ${letter}`
        : null,
    teamName: row.team_name,
    routineStartedAt: startedAt,
    routineSeconds,
    notesRoutine,
    notes,
  };
}

// The judge's name if this person is judging this category in the event's
// playing pool right now, otherwise null (event off, pool changed, wrong link).
export async function getJudgeAssignment(
  eventId: string,
  playerId: string,
  category: JudgingCategory
): Promise<{ name: string } | null> {
  if (!UUID.test(eventId) || !UUID.test(playerId)) return null;
  const result = await pool.query<{ first_name: string; last_name: string }>(
    `SELECT p.first_name, p.last_name
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN pool_judges j ON j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
     JOIN players p ON p.id = j.player_id
     WHERE e.id = $1 AND e.is_playing AND j.player_id = $2 AND j.category_type = $3`,
    [eventId, playerId, category.type]
  );
  const row = result.rows[0];
  return row ? { name: `${row.first_name} ${row.last_name}` } : null;
}
