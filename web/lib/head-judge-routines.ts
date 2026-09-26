import 'server-only';
import { randomUUID } from 'node:crypto';
import { pool } from './db';

// Starting and cancelling a routine, as the Head Judge's actions do it. No
// permission check here (head-judge-actions.ts adds it) so it can be tested.

// The routine can't have started before this long ago: a routine is at most
// 5 minutes, so an older click time is a bad clock, not a real click.
const MAX_CLICK_AGE = '10 minutes';

// Records the first throw. `clickedAt` is the click's time on the server's clock
// (in ms); it is kept unless it is in the future or too old to be real, in which
// case the database's current time is used. Only the first start counts: if a
// routine is already running its time is kept and returned.
export async function startRoutineRow(
  eventId: string,
  clickedAt: number
): Promise<{ error: string | null; startedAt?: number }> {
  // One statement starts the timer, creates the routine row (the judges' notes
  // and scores hang off it) and fixes who is competing (aliases resolved to the
  // main player), so they cannot disagree.
  const routineId = randomUUID();
  const updated = await pool.query<{ started_ms: number }>(
    `WITH started AS (
       UPDATE event_play_state s
       SET routine_started_at = CASE WHEN c.ts > now() OR c.ts < now() - interval '${MAX_CLICK_AGE}' THEN now() ELSE c.ts END,
           routine_id = $3::uuid,
           updated_at = now()
       FROM (SELECT to_timestamp($2::float8 / 1000.0) AS ts) c
       WHERE s.event_id = $1 AND s.team_id IS NOT NULL AND s.routine_started_at IS NULL
       RETURNING s.event_id, s.division_id, s.round_number, s.pool_id, s.team_id, s.routine_started_at
     ), made AS (
       INSERT INTO routines (id, event_id, division_id, round_number, pool_id, team_id, started_at)
       SELECT $3::uuid, event_id, division_id, round_number, pool_id, team_id, routine_started_at FROM started
       RETURNING id
     ), who AS (
       INSERT INTO routine_players (routine_id, player_id)
       SELECT DISTINCT $3::uuid, COALESCE(p.alias_id, p.id)
       FROM started
       JOIN team_players tp ON tp.team_id = started.team_id
       JOIN players p ON p.id = tp.player_id
       ON CONFLICT DO NOTHING
     )
     SELECT extract(epoch FROM routine_started_at)::float8 * 1000 AS started_ms FROM started`,
    [eventId, clickedAt, routineId]
  );
  if (updated.rows[0]) return { error: null, startedAt: Math.round(updated.rows[0].started_ms) };

  const current = await pool.query<{ team_id: string | null; started_ms: number | null }>(
    `SELECT team_id, extract(epoch FROM routine_started_at)::float8 * 1000 AS started_ms
     FROM event_play_state WHERE event_id = $1`,
    [eventId]
  );
  const row = current.rows[0];
  if (row?.started_ms != null) return { error: null, startedAt: Math.round(row.started_ms) };
  return { error: 'Choose the playing team first' };
}

// Brings back a cancelled routine's notes and scores by marking it finished, so
// it counts like a routine that was played. Only while no routine is running,
// and only for the playing team's latest routine in the playing pool (the one
// the Play tab offers). Safe to repeat.
export async function restoreRoutineRow(eventId: string, routineId: string): Promise<{ error: string | null }> {
  const restored = await pool.query(
    `UPDATE routines r SET status = 'finished'
     FROM event_play_state s
     WHERE r.id = $2 AND r.event_id = $1 AND r.status = 'cancelled'
       AND s.event_id = r.event_id AND s.routine_started_at IS NULL
       AND r.division_id = s.division_id AND r.round_number = s.round_number AND r.pool_id = s.pool_id
       AND r.team_id = s.team_id
       AND NOT EXISTS (
         SELECT 1 FROM routines later
         WHERE later.event_id = r.event_id AND later.division_id = r.division_id AND later.round_number = r.round_number
           AND later.pool_id = r.pool_id AND later.team_id = r.team_id AND later.started_at > r.started_at)`,
    [eventId, routineId]
  );
  if (restored.rowCount !== 0) return { error: null };

  const already = await pool.query(`SELECT 1 FROM routines WHERE id = $1 AND event_id = $2 AND status = 'finished'`, [
    routineId,
    eventId,
  ]);
  return { error: already.rows.length > 0 ? null : "That routine can't be restored now" };
}

// Ends the running routine as played (status finished, not cancelled: its notes
// and scores stay) and puts the next team up, ready for its first throw.
// `nextTeamId` must be a team of the playing pool, otherwise (or when null, after
// the last team) no team is up. Only while a routine is running; safe to repeat.
export async function finishRoutineRow(eventId: string, nextTeamId: string | null): Promise<void> {
  await pool.query(
    `WITH finished AS (
       UPDATE routines SET status = 'finished', ended_at = now()
       WHERE id = (SELECT routine_id FROM event_play_state WHERE event_id = $1 AND routine_started_at IS NOT NULL)
         AND status = 'running'
     )
     UPDATE event_play_state s
     SET routine_started_at = NULL, routine_id = NULL, updated_at = now(),
         team_id = (SELECT t.id FROM teams t
                    WHERE t.id = $2::uuid AND t.division_id = s.division_id
                      AND t.round_number = s.round_number AND t.pool_id = s.pool_id)
     WHERE s.event_id = $1 AND s.routine_started_at IS NOT NULL`,
    [eventId, nextTeamId]
  );
}

// Cancels the running routine. The routine row is kept, marked cancelled, so
// its notes and scores can be told apart from a routine that was played. Safe
// to repeat.
export async function cancelRoutineRow(eventId: string): Promise<void> {
  await pool.query(
    `WITH cancelled AS (
       UPDATE routines SET status = 'cancelled', ended_at = now()
       WHERE id = (SELECT routine_id FROM event_play_state WHERE event_id = $1 AND routine_started_at IS NOT NULL)
         AND status = 'running'
     )
     UPDATE event_play_state SET routine_started_at = NULL, routine_id = NULL, updated_at = now()
     WHERE event_id = $1 AND routine_started_at IS NOT NULL`,
    [eventId]
  );
}
