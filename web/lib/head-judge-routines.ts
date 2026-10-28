import "server-only";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { noteCategoryOf } from "./judging";
import { adjustedScore, estimateFromNotes } from "./judging-estimate";
import {
  adjustUnit,
  categorySettings,
  resolveEventSettings,
  scoreLimitOf,
  snapshotCategorySettings,
} from "./judging-settings";
import { ensureEventPresets } from "./judging-settings-store";
import { isPoolLocked, POOL_LOCKED_ERROR } from "./pool-locks";

// Starting and cancelling a routine, as the Head Judge's actions do it. No
// permission check here (head-judge-actions.ts adds it) so it can be tested.

// The routine can't have started before this long ago: a routine is at most
// 5 minutes, so an older click time is a bad clock, not a real click.
const MAX_CLICK_AGE = "10 minutes";

// Records the first throw. `clickedAt` is the click's time on the server's clock
// (in ms); it is kept unless it is in the future or too old to be real, in which
// case the database's current time is used. Only the first start counts: if a
// routine is already running its time is kept and returned.
export async function startRoutineRow(
  eventId: string,
  clickedAt: number,
): Promise<{ error: string | null; startedAt?: number }> {
  // A locked pool never gets a new routine (a routine is what notes and scores
  // attach to); checked here too, not just where the playing pool is chosen, in
  // case it was locked after being selected.
  const state = await pool.query<{
    division_id: string;
    round_number: number;
    pool_id: string;
  }>(
    `SELECT division_id, round_number, pool_id FROM event_play_state
     WHERE event_id = $1 AND team_id IS NOT NULL AND routine_started_at IS NULL`,
    [eventId],
  );
  const playing = state.rows[0];
  if (
    playing &&
    (await isPoolLocked(
      playing.division_id,
      playing.round_number,
      playing.pool_id,
    ))
  ) {
    return { error: POOL_LOCKED_ERROR };
  }

  // One statement starts the timer, creates the routine row (the judges' notes
  // and scores hang off it) and fixes who is competing (aliases resolved to the
  // main player), so they cannot disagree.
  const routineId = randomUUID();
  const updated = await pool.query<{ started_ms: number }>(
    `WITH started AS (
       UPDATE event_play_state s
       SET routine_started_at = CASE WHEN c.ts > now() OR c.ts < now() - interval '${MAX_CLICK_AGE}' THEN now() ELSE c.ts END,
           routine_id = $3::uuid,
           judges_ready_at = NULL,
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
    [eventId, clickedAt, routineId],
  );
  if (updated.rows[0]) {
    // The event's first routine makes its event presets (no-op after that).
    // The routine has started either way.
    try {
      await ensureEventPresets(eventId);
    } catch (err) {
      console.error("Could not make the event presets", err);
    }
    return { error: null, startedAt: Math.round(updated.rows[0].started_ms) };
  }

  const current = await pool.query<{
    team_id: string | null;
    started_ms: number | null;
  }>(
    `SELECT team_id, extract(epoch FROM routine_started_at)::float8 * 1000 AS started_ms
     FROM event_play_state WHERE event_id = $1`,
    [eventId],
  );
  const row = current.rows[0];
  if (row?.started_ms != null)
    return { error: null, startedAt: Math.round(row.started_ms) };
  return { error: "Choose the playing team first" };
}

// Readies the judges for the next routine (their screens clear their notes and
// stay on Play) or un-readies them. Only while no routine is running: starting
// one clears it. Safe to repeat.
export async function setJudgesReadyRow(
  eventId: string,
  ready: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE event_play_state
     SET judges_ready_at = CASE WHEN $2::boolean THEN now() ELSE NULL END, updated_at = now()
     WHERE event_id = $1 AND routine_started_at IS NULL`,
    [eventId, ready],
  );
}

// Brings back a cancelled routine's notes and scores by marking it finished, so
// it counts like a routine that was played. Only while no routine is running,
// and only for the playing team's latest routine in the playing pool (the one
// the Play tab offers). Safe to repeat.
export async function restoreRoutineRow(
  eventId: string,
  routineId: string,
): Promise<{ error: string | null }> {
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
    [eventId, routineId],
  );
  if (restored.rowCount !== 0) return { error: null };

  const already = await pool.query(
    `SELECT 1 FROM routines WHERE id = $1 AND event_id = $2 AND status = 'finished'`,
    [routineId, eventId],
  );
  return {
    error:
      already.rows.length > 0 ? null : "That routine can't be restored now",
  };
}

// Ends the running routine as played (status finished, not cancelled: its notes
// and scores stay) and puts the next team up, ready for its first throw.
// `nextTeamId` must be a team of the playing pool, otherwise (or when null, after
// the last team) no team is up. Only while a routine is running; safe to repeat.
export async function finishRoutineRow(
  eventId: string,
  nextTeamId: string | null,
): Promise<void> {
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
    [eventId, nextTeamId],
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
    [eventId],
  );
}

// Moves the running routine's first throw to `startedAt` (ms, server clock), for
// when Start was pressed late. Every screen's timer follows on its next read,
// notes before the new start stop counting (and ones after it start to), and
// scores already submitted for the routine get their baseline worked out again
// from the new start, keeping each judge's percentage change. Only for the
// routine that is running now (`routineId`), never later than now, and no
// earlier than a routine start could be (MAX_CLICK_AGE).
export async function adjustRoutineStartRow(
  eventId: string,
  routineId: string,
  startedAt: number,
): Promise<{ error: string | null; startedAt?: number }> {
  const state = await pool.query<{
    division_id: string;
    round_number: number;
    pool_id: string;
  }>(
    `SELECT division_id, round_number, pool_id FROM event_play_state
     WHERE event_id = $1 AND routine_id = $2::uuid AND routine_started_at IS NOT NULL`,
    [eventId, routineId],
  );
  const playing = state.rows[0];
  if (!playing) return { error: "That routine is no longer running" };
  if (
    await isPoolLocked(
      playing.division_id,
      playing.round_number,
      playing.pool_id,
    )
  ) {
    return { error: POOL_LOCKED_ERROR };
  }

  const moved = await pool.query<{ started_ms: number }>(
    `WITH moved AS (
       UPDATE event_play_state s
       SET routine_started_at = LEAST(c.ts, now()), updated_at = now()
       FROM (SELECT to_timestamp($3::float8 / 1000.0) AS ts) c
       WHERE s.event_id = $1 AND s.routine_id = $2::uuid AND s.routine_started_at IS NOT NULL
         AND c.ts >= now() - interval '${MAX_CLICK_AGE}'
       RETURNING s.routine_started_at
     ), routine AS (
       UPDATE routines r SET started_at = moved.routine_started_at
       FROM moved
       WHERE r.id = $2::uuid AND r.event_id = $1
     )
     SELECT extract(epoch FROM routine_started_at)::float8 * 1000 AS started_ms FROM moved`,
    [eventId, routineId, startedAt],
  );
  if (!moved.rows[0])
    return { error: "The start must be within the last 10 minutes" };
  const newStart = Math.round(moved.rows[0].started_ms);
  await rescoreRoutine(routineId, newStart);
  return { error: null, startedAt: newStart };
}

// Works out again the baseline (and so the score) of every score submitted for
// the routine, from its notes and a new start time, with the settings each score
// was made with (as the results read them) and the judge's percentage change.
async function rescoreRoutine(
  routineId: string,
  startedAt: number,
): Promise<void> {
  const scores = await pool.query<{
    judge_player_id: string;
    category_type: string;
    adjust_percent: string;
    settings: unknown;
    routine_seconds: number;
    rules_id: string | null;
    judging_settings: unknown;
  }>(
    `SELECT sc.judge_player_id, sc.category_type, sc.adjust_percent, sc.settings,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, e.judging_settings
     FROM fpa2027_judge_scores sc
     JOIN routines r ON r.id = sc.routine_id
     JOIN events e ON e.id = r.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     WHERE sc.routine_id = $1`,
    [routineId],
  );
  for (const sc of scores.rows) {
    const category = noteCategoryOf(sc.category_type);
    if (!category) continue;
    const current = categorySettings(
      resolveEventSettings(sc.rules_id ?? "Fpa2020", sc.judging_settings),
      category,
    );
    const snapshot = snapshotCategorySettings(
      sc.settings,
      category,
      scoreLimitOf(current),
    );
    const settings = snapshot !== null ? snapshot : current;
    if (!settings) continue;

    const notes = await pool.query<{
      note_type: string;
      noted_ms: number;
      line_value: string | null;
      multiplier: string | null;
    }>(
      `SELECT note_type, extract(epoch FROM noted_at)::float8 * 1000 AS noted_ms, line_value, multiplier
       FROM fpa2027_judge_notes
       WHERE routine_id = $1 AND player_id = $2 AND category_type = $3`,
      [routineId, sc.judge_player_id, sc.category_type],
    );
    const { baseline } = estimateFromNotes(
      notes.rows.map((n) => ({
        noteType: n.note_type,
        notedAt: Math.round(n.noted_ms),
        lineValue: n.line_value === null ? null : Number(n.line_value),
        multiplier: n.multiplier === null ? null : Number(n.multiplier),
      })),
      startedAt,
      sc.routine_seconds,
      settings.noteWeights,
      settings.estimate,
      category,
      scoreLimitOf(settings),
    );
    await pool.query(
      `UPDATE fpa2027_judge_scores SET baseline_estimate = $4, score = $5
       WHERE routine_id = $1 AND judge_player_id = $2 AND category_type = $3`,
      [
        routineId,
        sc.judge_player_id,
        sc.category_type,
        baseline,
        adjustedScore(baseline, Number(sc.adjust_percent), adjustUnit(category, settings)),
      ],
    );
  }
}
