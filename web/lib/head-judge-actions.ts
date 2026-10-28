"use server";

import { requirePermission } from "./authz";
import { pool } from "./db";
import { POOL_LETTERS, poolId } from "./event-creator";
import {
  adjustRoutineStartRow,
  cancelRoutineRow,
  finishRoutineRow,
  restoreRoutineRow,
  setJudgesReadyRow,
  startRoutineRow,
} from "./head-judge-routines";
import {
  isPoolLocked,
  setPoolLockedRow,
  POOL_LOCKED_ERROR,
} from "./pool-locks";
import { postPoolResults, type PostOutcome } from "./discord-posts";
import {
  isPoolResultsPublished,
  setPoolResultsPublishedRow,
} from "./pool-publish";
import { getOrCreateShortCode } from "./pool-shortlink";
import { getOrCreateAnnouncerCode } from "./announcer-link";
import { regenerateJudgePin } from "./judge-pin";
import { relayPlayState } from "./play-state-relay";
import { getMode } from "./db-mode";

const guard = () => requirePermission("head_judge");

// Bad ids are answered with an error the screen shows, rather than a database
// error the screen would take for a lost connection and keep retrying.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_ID: PlayActionResult = { error: "Unknown event, division or team" };
const RUNNING_ERROR = (what: "pool" | "team") =>
  `A routine is running. Cancel it before changing the ${what}.`;

export type PlayActionResult = { error: string | null };

// Makes a pool the playing pool; the team starts over. Refused while a routine is running.
export async function setPlayingPool(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(divisionId)) return BAD_ID;
  if (!(POOL_LETTERS as readonly string[]).includes(letter))
    return { error: "Unknown pool" };
  if (!Number.isInteger(roundNumber) || roundNumber < 1)
    return { error: "Unknown round" };

  const found = await pool.query(
    `SELECT 1 FROM teams t JOIN divisions d ON d.id = t.division_id
     WHERE d.event_id = $1 AND t.division_id = $2 AND t.round_number = $3 AND t.pool_id = $4
     LIMIT 1`,
    [eventId, divisionId, roundNumber, poolId(letter)],
  );
  if (found.rows.length === 0)
    return { error: "That pool has no teams in this event" };
  if (await isPoolLocked(divisionId, roundNumber, poolId(letter)))
    return { error: POOL_LOCKED_ERROR };

  // A running routine is never dropped by changing the pool: cancel it first.
  const saved = await pool.query(
    `INSERT INTO event_play_state (event_id, division_id, round_number, pool_id, team_id, routine_started_at, updated_at)
     VALUES ($1, $2, $3, $4, NULL, NULL, now())
     ON CONFLICT (event_id) DO UPDATE
     SET division_id = $2, round_number = $3, pool_id = $4, team_id = NULL, judges_ready_at = NULL, updated_at = now()
     WHERE event_play_state.routine_started_at IS NULL`,
    [eventId, divisionId, roundNumber, poolId(letter)],
  );
  if (saved.rowCount === 0) return { error: RUNNING_ERROR("pool") };
  relayPlayState(eventId);
  return { error: null };
}

// Sets the team that is up; it must be in the playing pool. Refused while a
// routine is running (it has to be cancelled first).
export async function setPlayingTeam(
  eventId: string,
  teamId: string,
): Promise<PlayActionResult> {
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
    [eventId, teamId],
  );
  if (updated.rowCount !== 0) {
    relayPlayState(eventId);
    return { error: null };
  }

  const running = await pool.query(
    "SELECT 1 FROM event_play_state WHERE event_id = $1 AND routine_started_at IS NOT NULL",
    [eventId],
  );
  return {
    error:
      running.rows.length > 0
        ? RUNNING_ERROR("team")
        : "That team isn't in the playing pool",
  };
}

// Readies the judges for the next routine (their notes go back to 0 and they
// stay on Play) or un-readies them. Refused while a routine is running; starting
// the routine un-readies them. Safe to repeat.
export async function setJudgesReady(
  eventId: string,
  ready: boolean,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  await setJudgesReadyRow(eventId, ready === true);
  relayPlayState(eventId);
  return { error: null };
}

// Records the first throw. `clickedAt` is the click's time on the server's clock
// (in ms); it is kept unless it is in the future or too old to be real, in which
// case the database's current time is used. Only the first start counts: if a
// routine is already running its time is kept and returned.
export async function startRoutine(
  eventId: string,
  clickedAt: number,
): Promise<PlayActionResult & { startedAt?: number }> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  if (!Number.isFinite(clickedAt)) return { error: "Bad click time" };

  const result = await startRoutineRow(eventId, clickedAt);
  if (!result.error) relayPlayState(eventId);
  return result;
}

// Moves the running routine's first throw (`startedAt`, ms on the server's
// clock), for when Start was pressed late. Refused if `routineId` is no longer
// the running routine. Scores already submitted for it are worked out again.
export async function adjustRoutineStart(
  eventId: string,
  routineId: string,
  startedAt: number,
): Promise<PlayActionResult & { startedAt?: number }> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(routineId)) return BAD_ID;
  if (!Number.isFinite(startedAt)) return { error: "Bad start time" };

  const result = await adjustRoutineStartRow(eventId, routineId, startedAt);
  if (!result.error) relayPlayState(eventId);
  return result;
}

// Ends the running routine as played (not cancelled) and puts the next team up.
// `nextTeamId` is null after the last team; a team that isn't in the playing
// pool is ignored. Safe to repeat.
export async function finishRoutine(
  eventId: string,
  nextTeamId: string | null,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || (nextTeamId !== null && !UUID.test(nextTeamId)))
    return BAD_ID;
  await finishRoutineRow(eventId, nextTeamId);
  relayPlayState(eventId);
  return { error: null };
}

// Cancels the running routine. Safe to repeat.
export async function cancelRoutine(
  eventId: string,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  await cancelRoutineRow(eventId);
  relayPlayState(eventId);
  return { error: null };
}

// Brings back the playing team's cancelled routine (its notes and scores count
// again). Safe to repeat.
export async function restoreRoutine(
  eventId: string,
  routineId: string,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(eventId) || !UUID.test(routineId)) return BAD_ID;
  const result = await restoreRoutineRow(eventId, routineId);
  if (!result.error) relayPlayState(eventId);
  return result;
}

// Locks or unlocks a pool: while locked, its scores, teams and judges can't be
// changed (from here or from the Event Creator). Locking is refused while a
// routine is running in it; unlocking always succeeds.
export async function setPoolLocked(
  divisionId: string,
  roundNumber: number,
  letter: string,
  locked: boolean,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(divisionId)) return { error: "Unknown division" };
  if (!(POOL_LETTERS as readonly string[]).includes(letter))
    return { error: "Unknown pool" };
  if (!Number.isInteger(roundNumber) || roundNumber < 1)
    return { error: "Unknown round" };
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
  published: boolean,
): Promise<PlayActionResult & { discord?: PostOutcome }> {
  await guard();
  if (!UUID.test(divisionId)) return { error: "Unknown division" };
  if (!(POOL_LETTERS as readonly string[]).includes(letter))
    return { error: "Unknown pool" };
  if (!Number.isInteger(roundNumber) || roundNumber < 1)
    return { error: "Unknown round" };
  const wasPublished = await isPoolResultsPublished(
    divisionId,
    roundNumber,
    poolId(letter),
  );
  await setPoolResultsPublishedRow(
    divisionId,
    roundNumber,
    poolId(letter),
    published,
  );
  if (!published || wasPublished) return { error: null };
  return {
    error: null,
    discord: await postPoolResults(divisionId, roundNumber, letter),
  };
}

// Throws away everything judged in a pool of a test event (its routines, with
// their notes and scores, and its Simple Ranking ballots) so it can be judged
// again. Teams, judges and the pool's settings stay. Refused for a real event,
// a locked pool, or while a routine is running in the pool.
export async function clearPoolResults(
  divisionId: string,
  roundNumber: number,
  letter: string,
): Promise<PlayActionResult> {
  await guard();
  if (!UUID.test(divisionId)) return { error: "Unknown division" };
  if (!(POOL_LETTERS as readonly string[]).includes(letter))
    return { error: "Unknown pool" };
  if (!Number.isInteger(roundNumber) || roundNumber < 1)
    return { error: "Unknown round" };
  const id = poolId(letter);

  const event = await pool.query<{ id: string; is_test: boolean }>(
    "SELECT e.id, e.is_test FROM divisions d JOIN events e ON e.id = d.event_id WHERE d.id = $1",
    [divisionId],
  );
  const row = event.rows[0];
  if (!row) return { error: "Unknown division" };
  if (!row.is_test)
    return { error: "Only a test event’s results can be cleared." };
  if (await isPoolLocked(divisionId, roundNumber, id))
    return { error: POOL_LOCKED_ERROR };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const running = await client.query(
      `SELECT 1 FROM event_play_state
       WHERE division_id = $1 AND round_number = $2 AND pool_id = $3 AND routine_started_at IS NOT NULL`,
      [divisionId, roundNumber, id],
    );
    if (running.rows.length > 0) {
      await client.query("ROLLBACK");
      return {
        error:
          "A routine is running in this pool. Finish or cancel it before clearing.",
      };
    }
    await client.query(
      "DELETE FROM routines WHERE division_id = $1 AND round_number = $2 AND pool_id = $3",
      [divisionId, roundNumber, id],
    );
    await client.query(
      "DELETE FROM simple_ranking_ballots WHERE division_id = $1 AND round_number = $2 AND pool_id = $3",
      [divisionId, roundNumber, id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  relayPlayState(row.id);
  return { error: null };
}

// The pool's public permalink code, generating one the first time it's asked for.
export async function ensurePoolLink(
  divisionId: string,
  roundNumber: number,
  letter: string,
): Promise<PlayActionResult & { code?: string }> {
  await guard();
  if (!UUID.test(divisionId)) return { error: "Unknown division" };
  if (!(POOL_LETTERS as readonly string[]).includes(letter))
    return { error: "Unknown pool" };
  if (!Number.isInteger(roundNumber) || roundNumber < 1)
    return { error: "Unknown round" };
  const code = await getOrCreateShortCode(
    divisionId,
    roundNumber,
    poolId(letter),
  );
  return { error: null, code };
}

// The event's unlisted Announcer link code (/a/<code>), made on first use.
export async function ensureAnnouncerLink(
  eventId: string,
): Promise<PlayActionResult & { code?: string }> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  try {
    const code = await getOrCreateAnnouncerCode(eventId);
    return code ? { error: null, code } : { error: "Unknown event" };
  } catch {
    return {
      error:
        getMode() === "local"
          ? "Couldn't reach the online database. Get the announcer link while the laptop is online."
          : "Could not get a link",
    };
  }
}

// A new judge PIN for the event: every judging device has to enter it again.
// Made on Neon like the Announcer link, so it needs the online database.
export async function newJudgePin(
  eventId: string,
): Promise<PlayActionResult & { pin?: string }> {
  await guard();
  if (!UUID.test(eventId)) return BAD_ID;
  try {
    const pin = await regenerateJudgePin(eventId);
    return pin ? { error: null, pin } : { error: "Unknown event" };
  } catch {
    return {
      error:
        getMode() === "local"
          ? "Couldn't reach the online database. Make a new PIN while the laptop is online."
          : "Could not make a new PIN",
    };
  }
}
