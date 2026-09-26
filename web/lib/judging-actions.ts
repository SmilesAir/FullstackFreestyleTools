'use server';

import { pool } from './db';
import { JUDGING_RULES_ID, MAX_NOTES_PER_ROUTINE, noteTypesFor } from './judging';
import { adjustedScore, estimateFromNotes } from './judging-estimate';
import { categorySettings, resolveEventSettings } from './judging-settings';

// Public on purpose: judges don't log in. Every action checks that the person
// is judging this category in the event's playing pool (of a division that uses
// the Fpa2027 judging system) instead.
//
// Bad input and refusals are answered with a message the screen shows, not a
// database error, because the screen retries anything that throws.

export type NoteActionResult = { error: string | null };
export type SubmitResult = { error: string | null; score?: number; baseline?: number; adjustPercent?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_INPUT: NoteActionResult = { error: 'That note could not be read' };
const ALREADY_SUBMITTED = 'Score already submitted';
const DEFAULT_RULES_ID = 'Fpa2020';

// What a Difficulty note is made of, worked out here from the event's settings so
// a screen can only send where it tapped and how it rated: the numberline score
// (the position x the line's length) and the rating's multiplier.
function difficultyValues(
  judgingSettings: unknown,
  rulesId: string | null,
  rating: string,
  position: number
): { lineValue: number; multiplier: number } {
  const settings = categorySettings(resolveEventSettings(rulesId ?? DEFAULT_RULES_ID, judgingSettings), 'Diff')!;
  return {
    lineValue: Math.round(position * settings.line!.max * 10000) / 10000,
    multiplier: settings.noteWeights[rating],
  };
}

// A tap position: a number from 0 (the bottom of the numberline) to 1 (the top).
const validPosition = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

// Saves one note against the running routine. `clickedAt` is the press on the
// server's clock (ms); it is kept between the routine's start and now.
// `routineId` is the routine the judge's screen was showing: a note sent late,
// after that routine was cancelled and another started, is refused instead of
// landing on the new one. Saving the same note id again does nothing. Once the
// judge has submitted their score for the routine, their notes are locked. A
// Difficulty note also takes where the judge tapped on the numberline
// (`linePosition`, 0 to 1) and its note type is the rating; the other
// categories take no position.
export async function addNote(
  eventId: string,
  playerId: string,
  categoryType: string,
  noteId: string,
  noteType: string,
  clickedAt: number,
  routineId: string,
  linePosition?: number
): Promise<NoteActionResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(noteId) || !UUID.test(routineId)) return BAD_INPUT;
  if (!Number.isFinite(clickedAt)) return BAD_INPUT;
  if (!noteTypesFor(categoryType)?.includes(noteType)) return BAD_INPUT;
  const isDifficulty = categoryType === 'Diff';
  if (isDifficulty ? !validPosition(linePosition) : linePosition !== undefined && linePosition !== null) return BAD_INPUT;

  // The running routine's settings, for the numberline score and multiplier.
  let values: { lineValue: number; multiplier: number } | null = null;
  if (isDifficulty) {
    const context = await pool.query<{ judging_settings: unknown; rules_id: string | null }>(
      `SELECT e.judging_settings, d.rules_id
       FROM events e JOIN event_play_state s ON s.event_id = e.id LEFT JOIN divisions d ON d.id = s.division_id
       WHERE e.id = $1`,
      [eventId]
    );
    if (context.rows[0]) {
      values = difficultyValues(context.rows[0].judging_settings, context.rows[0].rules_id, noteType, linePosition!);
    }
  }

  const inserted = await pool.query(
    `INSERT INTO fpa2027_judge_notes
       (id, routine_id, event_id, player_id, category_type, note_type, noted_at, line_position, line_value, multiplier)
     SELECT $1::uuid, s.routine_id, e.id, $3::uuid, $4::text, $5::text,
            LEAST(now(), GREATEST(s.routine_started_at, to_timestamp($6::float8 / 1000.0))),
            $10::numeric, $11::numeric, $12::numeric
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN divisions d ON d.id = s.division_id AND d.rules_id = $9
     WHERE e.id = $2 AND e.is_playing
       AND s.routine_id = $8::uuid AND s.routine_started_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pool_judges j
         WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
           AND j.player_id = $3 AND j.category_type = $4)
       AND NOT EXISTS (
         SELECT 1 FROM fpa2027_judge_scores sc
         WHERE sc.routine_id = s.routine_id AND sc.judge_player_id = $3 AND sc.category_type = $4)
       AND (SELECT count(*) FROM fpa2027_judge_notes x
            WHERE x.routine_id = s.routine_id AND x.player_id = $3 AND x.category_type = $4) < $7
     ON CONFLICT (id) DO NOTHING`,
    [
      noteId,
      eventId,
      playerId,
      categoryType,
      noteType,
      clickedAt,
      MAX_NOTES_PER_ROUTINE,
      routineId,
      JUDGING_RULES_ID,
      isDifficulty ? linePosition : null,
      values?.lineValue ?? null,
      values?.multiplier ?? null,
    ]
  );
  if (inserted.rowCount === 1) return { error: null };

  // Nothing was stored: either this note is already saved (a resend), or it was refused.
  const why = await pool.query<{
    saved: boolean;
    playing: boolean;
    judging: boolean;
    running: boolean;
    same: boolean;
    submitted: boolean;
  }>(
    `SELECT EXISTS (SELECT 1 FROM fpa2027_judge_notes WHERE id = $1) AS saved,
            COALESCE(e.is_playing AND d.rules_id = $6, false) AS playing,
            COALESCE(s.routine_id IS NOT NULL AND s.routine_started_at IS NOT NULL, false) AS running,
            COALESCE(s.routine_id = $5::uuid, false) AS same,
            COALESCE(EXISTS (
              SELECT 1 FROM pool_judges j
              WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                AND j.player_id = $3 AND j.category_type = $4), false) AS judging,
            EXISTS (SELECT 1 FROM fpa2027_judge_scores sc
                    WHERE sc.routine_id = $5::uuid AND sc.judge_player_id = $3 AND sc.category_type = $4) AS submitted
     FROM (SELECT 1) one
     LEFT JOIN events e ON e.id = $2
     LEFT JOIN event_play_state s ON s.event_id = e.id
     LEFT JOIN divisions d ON d.id = s.division_id`,
    [noteId, eventId, playerId, categoryType, routineId, JUDGING_RULES_ID]
  );
  const r = why.rows[0];
  if (r.saved) return { error: null };
  if (!r.playing || !r.judging) return { error: "You're not judging right now" };
  if (!r.running) return { error: 'No routine is running' };
  if (!r.same) return { error: 'That routine was restarted, so the note was not saved' };
  if (r.submitted) return { error: ALREADY_SUBMITTED };
  return { error: 'Too many notes for this routine' };
}

// Changes one of this judge's own Difficulty notes: its rating and where it was
// tapped (the numberline score and multiplier are worked out again from the
// event's settings). Refused once the judge has submitted their score for that
// routine. A note that is gone (removed meanwhile) is ignored. Safe to repeat.
export async function editNote(
  eventId: string,
  playerId: string,
  noteId: string,
  rating: string,
  linePosition: number
): Promise<NoteActionResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(noteId)) return BAD_INPUT;
  if (!noteTypesFor('Diff')?.includes(rating) || !validPosition(linePosition)) return BAD_INPUT;

  const found = await pool.query<{ judging_settings: unknown; rules_id: string | null }>(
    `SELECT e.judging_settings, d.rules_id
     FROM fpa2027_judge_notes n
     JOIN routines r ON r.id = n.routine_id
     JOIN events e ON e.id = n.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     WHERE n.id = $1 AND n.event_id = $2 AND n.player_id = $3 AND n.category_type = 'Diff'`,
    [noteId, eventId, playerId]
  );
  if (!found.rows[0]) return { error: null };
  const { lineValue, multiplier } = difficultyValues(
    found.rows[0].judging_settings,
    found.rows[0].rules_id,
    rating,
    linePosition
  );

  const updated = await pool.query(
    `UPDATE fpa2027_judge_notes n
     SET note_type = $4, line_position = $5, line_value = $6, multiplier = $7
     WHERE n.id = $1 AND n.event_id = $2 AND n.player_id = $3 AND n.category_type = 'Diff'
       AND NOT EXISTS (
         SELECT 1 FROM fpa2027_judge_scores sc
         WHERE sc.routine_id = n.routine_id AND sc.judge_player_id = n.player_id AND sc.category_type = n.category_type)`,
    [noteId, eventId, playerId, rating, linePosition, lineValue, multiplier]
  );
  return { error: updated.rowCount === 1 ? null : ALREADY_SUBMITTED };
}

// Removes one of this judge's own notes (undo). Safe to repeat. Refused once
// the judge has submitted their score for that routine.
export async function deleteNote(
  eventId: string,
  playerId: string,
  categoryType: string,
  noteId: string
): Promise<NoteActionResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(noteId)) return BAD_INPUT;
  if (!noteTypesFor(categoryType)) return BAD_INPUT;
  const deleted = await pool.query(
    `DELETE FROM fpa2027_judge_notes n
     WHERE n.id = $1 AND n.event_id = $2 AND n.player_id = $3 AND n.category_type = $4
       AND NOT EXISTS (
         SELECT 1 FROM fpa2027_judge_scores sc
         WHERE sc.routine_id = n.routine_id AND sc.judge_player_id = n.player_id AND sc.category_type = n.category_type)`,
    [noteId, eventId, playerId, categoryType]
  );
  if (deleted.rowCount === 1) return { error: null };
  const locked = await pool.query(
    'SELECT 1 FROM fpa2027_judge_notes WHERE id = $1 AND event_id = $2 AND player_id = $3 AND category_type = $4',
    [noteId, eventId, playerId, categoryType]
  );
  return { error: locked.rows.length > 0 ? ALREADY_SUBMITTED : null };
}

type SavedNote = { noteType: string; notedAt: number; lineValue?: number; multiplier?: number };

async function readNotes(routineId: string, playerId: string, categoryType: string): Promise<SavedNote[]> {
  const result = await pool.query<{
    id: string;
    note_type: string;
    noted_ms: number;
    line_value: string | null;
    multiplier: string | null;
  }>(
    `SELECT id, note_type, extract(epoch FROM noted_at)::float8 * 1000 AS noted_ms, line_value, multiplier
     FROM fpa2027_judge_notes
     WHERE routine_id = $1 AND player_id = $2 AND category_type = $3
     ORDER BY noted_at, id`,
    [routineId, playerId, categoryType]
  );
  return result.rows.map((r) => ({
    id: r.id,
    noteType: r.note_type,
    notedAt: Math.round(r.noted_ms),
    ...(r.line_value !== null && r.multiplier !== null
      ? { lineValue: Number(r.line_value), multiplier: Number(r.multiplier) }
      : {}),
  })) as SavedNote[];
}

// Saves the judge's score for a routine. The routine is any routine of the pool
// the judge is judging now, or any routine of the event the judge has notes or a
// score for, so a submitted score can be changed at any time. The baseline is
// worked out here from the judge's saved notes and the event's settings (the
// screen only sends its percentage change), so a stored baseline is always the
// real one. Changing the score of a routine that is no longer running keeps its
// baseline and settings as they were stored. From now on the judge's notes for
// the routine are locked.
export async function submitScore(
  eventId: string,
  playerId: string,
  categoryType: string,
  routineId: string,
  adjustPercent: number
): Promise<SubmitResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(routineId)) return { error: 'That score could not be read' };
  if (!noteTypesFor(categoryType)) return { error: 'That score could not be read' };
  if (!Number.isFinite(adjustPercent)) return { error: 'That score could not be read' };
  const percent = Math.round(adjustPercent * 100) / 100;

  const context = await pool.query<{
    judging_settings: unknown;
    rules_id: string;
    routine_seconds: number;
    started_ms: number;
    running_now: boolean;
    stored_baseline: string | null;
  }>(
    `SELECT e.judging_settings, d.rules_id, d.routine_seconds,
            extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
            COALESCE(s.routine_id = r.id AND s.routine_started_at IS NOT NULL, false) AS running_now,
            sc.baseline_estimate AS stored_baseline
     FROM routines r
     JOIN events e ON e.id = r.event_id
     JOIN divisions d ON d.id = r.division_id AND d.rules_id = $5
     LEFT JOIN event_play_state s ON s.event_id = e.id
     LEFT JOIN fpa2027_judge_scores sc
       ON sc.routine_id = r.id AND sc.judge_player_id = $3 AND sc.category_type = $4
     WHERE r.id = $2::uuid AND r.event_id = $1 AND r.status <> 'cancelled'
       AND (
         sc.id IS NOT NULL
         OR EXISTS (SELECT 1 FROM fpa2027_judge_notes n
                    WHERE n.routine_id = r.id AND n.player_id = $3 AND n.category_type = $4)
         -- Any routine of the pool the judge is judging now (the running one,
         -- one they missed, or a backup entered from the Review tab).
         OR (e.is_playing AND s.division_id = r.division_id AND s.round_number = r.round_number
             AND s.pool_id = r.pool_id
             AND EXISTS (
               SELECT 1 FROM pool_judges j
               WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                 AND j.player_id = $3 AND j.category_type = $4))
       )`,
    [eventId, routineId, playerId, categoryType, JUDGING_RULES_ID]
  );
  const ctx = context.rows[0];
  if (!ctx) return { error: "You're not judging this routine" };

  // An earlier routine's score keeps its baseline: only the change is new.
  if (!ctx.running_now && ctx.stored_baseline !== null) {
    const baseline = Number(ctx.stored_baseline);
    await pool.query(
      `UPDATE fpa2027_judge_scores
       SET adjust_percent = $4, score = $5, submitted_at = now()
       WHERE routine_id = $1 AND judge_player_id = $2 AND category_type = $3`,
      [routineId, playerId, categoryType, percent, adjustedScore(baseline, percent)]
    );
    return { error: null, score: adjustedScore(baseline, percent), baseline, adjustPercent: percent };
  }

  // noteTypesFor above means this is a category that takes notes.
  const settings = categorySettings(resolveEventSettings(ctx.rules_id, ctx.judging_settings), categoryType)!;
  const startedAt = Math.round(ctx.started_ms);
  const baselineOf = (notes: SavedNote[]) =>
    estimateFromNotes(notes, startedAt, ctx.routine_seconds, settings.noteWeights, settings.estimate);
  const snapshot = JSON.stringify({ rulesId: ctx.rules_id, [categoryType]: settings });

  const save = (baseline: number) =>
    pool.query(
      `INSERT INTO fpa2027_judge_scores
         (routine_id, judge_player_id, category_type, baseline_estimate, adjust_percent, score, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (routine_id, judge_player_id, category_type)
       DO UPDATE SET baseline_estimate = EXCLUDED.baseline_estimate, adjust_percent = EXCLUDED.adjust_percent,
                     score = EXCLUDED.score, settings = EXCLUDED.settings, submitted_at = now()`,
      [routineId, playerId, categoryType, baseline, percent, adjustedScore(baseline, percent), snapshot]
    );

  const first = await readNotes(routineId, playerId, categoryType);
  let baseline = baselineOf(first);
  await save(baseline);

  // A note pressed between reading the notes and saving the score would be
  // missing from the baseline. The score row now locks further notes, so one
  // more look settles it.
  const second = await readNotes(routineId, playerId, categoryType);
  if (JSON.stringify(second) !== JSON.stringify(first)) {
    baseline = baselineOf(second);
    await save(baseline);
  }
  return { error: null, score: adjustedScore(baseline, percent), baseline, adjustPercent: percent };
}

// A backup for when something went wrong: saves the judge's score for a team of
// the pool they are judging now that has no routine (the timer was never
// started, say). The first judge to do this makes the team's routine, marked
// finished with no notes; everyone after uses it. Then it is an ordinary score
// (a baseline of 0, so the change moves it in fixed steps).
export async function submitBackupScore(
  eventId: string,
  playerId: string,
  categoryType: string,
  teamId: string,
  adjustPercent: number
): Promise<SubmitResult & { routineId?: string }> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(teamId)) return { error: 'That score could not be read' };
  if (!noteTypesFor(categoryType)) return { error: 'That score could not be read' };

  const client = await pool.connect();
  let routineId: string | null = null;
  try {
    await client.query('BEGIN');
    // One team at a time, so two judges can't each make a routine for it.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`backup-routine:${teamId}`]);
    const found = await client.query<{ id: string | null; division_id: string; round_number: number; pool_id: string }>(
      `SELECT (SELECT r.id FROM routines r
               WHERE r.event_id = e.id AND r.team_id = t.id AND r.division_id = t.division_id
                 AND r.round_number = t.round_number AND r.pool_id = t.pool_id AND r.status <> 'cancelled'
               ORDER BY r.started_at DESC LIMIT 1) AS id,
              t.division_id, t.round_number, t.pool_id
       FROM events e
       JOIN event_play_state s ON s.event_id = e.id
       JOIN divisions d ON d.id = s.division_id AND d.rules_id = $5
       JOIN teams t ON t.id = $4 AND t.division_id = s.division_id AND t.round_number = s.round_number
                   AND t.pool_id = s.pool_id
       WHERE e.id = $1 AND e.is_playing
         AND EXISTS (SELECT 1 FROM pool_judges j
                     WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                       AND j.player_id = $2 AND j.category_type = $3)`,
      [eventId, playerId, categoryType, teamId, JUDGING_RULES_ID]
    );
    const at = found.rows[0];
    if (!at) {
      await client.query('ROLLBACK');
      return { error: "That team isn't in the pool you're judging" };
    }
    routineId = at.id;
    if (routineId === null) {
      const made = await client.query<{ id: string }>(
        `INSERT INTO routines (event_id, division_id, round_number, pool_id, team_id, started_at, ended_at, status)
         VALUES ($1, $2, $3, $4, $5, now(), now(), 'finished')
         RETURNING id`,
        [eventId, at.division_id, at.round_number, at.pool_id, teamId]
      );
      routineId = made.rows[0].id;
      // Who competed, fixed now as a started routine would (aliases resolved).
      await client.query(
        `INSERT INTO routine_players (routine_id, player_id)
         SELECT DISTINCT $1::uuid, COALESCE(p.alias_id, p.id)
         FROM team_players tp JOIN players p ON p.id = tp.player_id
         WHERE tp.team_id = $2
         ON CONFLICT DO NOTHING`,
        [routineId, teamId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const result = await submitScore(eventId, playerId, categoryType, routineId, adjustPercent);
  return { ...result, routineId };
}
