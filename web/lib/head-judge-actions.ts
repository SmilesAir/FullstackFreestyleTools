'use server';

import { requirePermission } from './authz';
import { pool } from './db';
import { POOL_LETTERS, poolId } from './event-creator';
import { cancelRoutineRow, finishRoutineRow, restoreRoutineRow, startRoutineRow } from './head-judge-routines';
import { isPoolLocked, setPoolLockedRow, POOL_LOCKED_ERROR } from './pool-locks';
import { postPoolResults, type PostOutcome } from './discord-posts';
import { isPoolResultsPublished, setPoolResultsPublishedRow } from './pool-publish';
import { getOrCreateShortCode } from './pool-shortlink';

const guard = () => requirePermission('head_judge');

// Bad ids are answered with an error the screen shows, rather than a database
// error the screen would take for a lost connection and keep retrying.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_ID: PlayActionResult = { error: 'Unknown event, division or team' };
const RUNNING_ERROR = (what: 'pool' | 'team') => `A routine is running. Cancel it before changing the ${what}.`;

export type PlayActionResult = { error: string | null };


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
  if (await isPoolLocked(divisionId, roundNumber, poolId(letter))) return { error: POOL_LOCKED_ERROR };

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

  return startRoutineRow(eventId, clickedAt);
}

// Ends the running routine as played (not cancelled) and puts the next team up.
// `nextTeamId` is null after the last team; a team that isn't in the playing
// pool is ignored. Safe to repeat.
export async function finishRoutine(eventId: string, nextTeamId: string | null): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || (nextTeamId !== null && !UUID.test(nextTeamId))) return BAD_ID;
  await finishRoutineRow(eventId, nextTeamId);
  return { error: null };
}

// Cancels the running routine. Safe to repeat.
export async function cancelRoutine(eventId: string): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  await cancelRoutineRow(eventId);
  return { error: null };
}

// Brings back the playing team's cancelled routine (its notes and scores count
// again). Safe to repeat.
export async function restoreRoutine(eventId: string, routineId: string): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(routineId)) return BAD_ID;
  return restoreRoutineRow(eventId, routineId);
}

// Locks or unlocks a pool: while locked, its scores, teams and judges can't be
// changed (from here or from the Event Creator). Locking is refused while a
// routine is running in it; unlocking always succeeds.
export async function setPoolLocked(
  divisionId: string,
  roundNumber: number,
  letter: string,
  locked: boolean
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(divisionId)) return { error: 'Unknown division' };
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return { error: 'Unknown pool' };
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  return setPoolLockedRow(divisionId, roundNumber, poolId(letter), locked);
}

// Publishes or unpublishes a pool's results on its public permalink. Always
// succeeds (the same bool can be flipped back at any time). Publishing (from
// unpublished) also posts the results to the event's Discord thread, if the
// event has a channel; a Discord problem comes back as `discord`, never as an
// error, since the results are published either way.
export async function setPoolResultsPublished(
  divisionId: string,
  roundNumber: number,
  letter: string,
  published: boolean
): Promise<PlayActionResult & { discord?: PostOutcome }> {
  await guard();
  if (!UUID.test(divisionId)) return { error: 'Unknown division' };
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return { error: 'Unknown pool' };
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  const wasPublished = await isPoolResultsPublished(divisionId, roundNumber, poolId(letter));
  await setPoolResultsPublishedRow(divisionId, roundNumber, poolId(letter), published);
  if (!published || wasPublished) return { error: null };
  return { error: null, discord: await postPoolResults(divisionId, roundNumber, letter) };
}

// The pool's public permalink code, generating one the first time it's asked for.
export async function ensurePoolLink(
  divisionId: string,
  roundNumber: number,
  letter: string
): Promise<PlayActionResult & { code?: string }> {
  await guard();
  if (!UUID.test(divisionId)) return { error: 'Unknown division' };
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return { error: 'Unknown pool' };
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  const code = await getOrCreateShortCode(divisionId, roundNumber, poolId(letter));
  return { error: null, code };
}
