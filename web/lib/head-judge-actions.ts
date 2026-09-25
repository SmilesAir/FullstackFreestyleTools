'use server';

import { requirePermission } from './authz';
import { pool } from './db';
import { POOL_LETTERS, poolId } from './event-creator';

const guard = () => requirePermission('head_judge');

// Bad ids are answered with an error the screen shows, rather than a database
// error the screen would take for a lost connection and keep retrying.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_ID: PlayActionResult = { error: 'Unknown event, division or team' };
const RUNNING_ERROR = (what: 'pool' | 'team') => `A routine is running. Cancel it before changing the ${what}.`;

export type PlayActionResult = { error: string | null };

// The routine can't have started before this long ago: a routine is at most
// 5 minutes, so an older click time is a bad clock, not a real click.
const MAX_CLICK_AGE = '10 minutes';

// Makes a pool the playing pool; the team starts over. Refused while a routine is running.
export async function setPlayingPool(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(divisionId)) return BAD_ID;
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return { error: 'Unknown pool' };
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };

  const found = await pool.query(
    `SELECT 1 FROM teams t JOIN divisions d ON d.id = t.division_id
     WHERE d.event_id = $1 AND t.division_id = $2 AND t.round_number = $3 AND t.pool_id = $4
     LIMIT 1`,
    [eventId, divisionId, roundNumber, poolId(letter)]
  );
  if (found.rows.length === 0) return { error: "That pool has no teams in this event" };

  // A running routine is never dropped by changing the pool: cancel it first.
  const saved = await pool.query(
    `INSERT INTO event_play_state (event_id, division_id, round_number, pool_id, team_id, routine_started_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, NULL, now())
     ON CONFLICT (event_id) DO UPDATE
     SET division_id = $2, round_number = $3, pool_id = $4, team_id = NULL, updated_at = now()
     WHERE event_play_state.routine_started_at IS NULL`,
    [eventId, divisionId, roundNumber, poolId(letter)]
  );
  return saved.rowCount === 0 ? { error: RUNNING_ERROR('pool') } : { error: null };
}

// Sets the team that is up; it must be in the playing pool. Refused while a
// routine is running (it has to be cancelled first).
export async function setPlayingTeam(eventId: string, teamId: string): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(teamId)) return BAD_ID;
  const updated = await pool.query(
    `UPDATE event_play_state s
     SET team_id = $2, updated_at = now()
     WHERE s.event_id = $1
       AND s.routine_started_at IS NULL
       AND EXISTS (
         SELECT 1 FROM teams t
         WHERE t.id = $2 AND t.division_id = s.division_id AND t.round_number = s.round_number AND t.pool_id = s.pool_id
       )`,
    [eventId, teamId]
  );
  if (updated.rowCount !== 0) return { error: null };

  const running = await pool.query('SELECT 1 FROM event_play_state WHERE event_id = $1 AND routine_started_at IS NOT NULL', [
    eventId,
  ]);
  return { error: running.rows.length > 0 ? RUNNING_ERROR('team') : "That team isn't in the playing pool" };
}

// Records the first throw. `clickedAt` is the click's time on the server's clock
// (in ms); it is kept unless it is in the future or too old to be real, in which
// case the database's current time is used. Only the first start counts: if a
// routine is already running its time is kept and returned.
export async function startRoutine(
  eventId: string,
  clickedAt: number
): Promise<PlayActionResult & { startedAt?: number }> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  if (!Number.isFinite(clickedAt)) return { error: 'Bad click time' };

  const updated = await pool.query<{ started_ms: number }>(
    `UPDATE event_play_state s
     SET routine_started_at = CASE WHEN c.ts > now() OR c.ts < now() - interval '${MAX_CLICK_AGE}' THEN now() ELSE c.ts END,
         updated_at = now()
     FROM (SELECT to_timestamp($2::float8 / 1000.0) AS ts) c
     WHERE s.event_id = $1 AND s.team_id IS NOT NULL AND s.routine_started_at IS NULL
     RETURNING extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms`,
    [eventId, clickedAt]
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

// Cancels the running routine. Safe to repeat.
export async function cancelRoutine(eventId: string): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  await pool.query(
    `UPDATE event_play_state SET routine_started_at = NULL, updated_at = now()
     WHERE event_id = $1 AND routine_started_at IS NOT NULL`,
    [eventId]
  );
  return { error: null };
}
