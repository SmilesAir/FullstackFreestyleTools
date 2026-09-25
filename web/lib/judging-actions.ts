'use server';

import { pool } from './db';
import { MAX_NOTES_PER_ROUTINE, noteTypesFor } from './judging';

// Public on purpose: judges don't log in. Every action checks that the person
// is judging this category in the event's playing pool instead.
//
// Bad input and refusals are answered with a message the screen shows, not a
// database error, because the screen retries anything that throws.

export type NoteActionResult = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_INPUT: NoteActionResult = { error: 'That note could not be read' };

// Saves one note against the team that is playing. `clickedAt` is the press on
// the server's clock (ms); it is kept between the routine's start and now.
// `routineStartedAt` is the routine the judge's screen was showing: a note sent
// late, after that routine was cancelled and restarted, is refused instead of
// landing on the new routine. Saving the same note id again does nothing.
export async function addNote(
  eventId: string,
  playerId: string,
  categoryType: string,
  noteId: string,
  noteType: string,
  clickedAt: number,
  routineStartedAt: number
): Promise<NoteActionResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(noteId)) return BAD_INPUT;
  if (!Number.isFinite(clickedAt) || !Number.isFinite(routineStartedAt)) return BAD_INPUT;
  if (!noteTypesFor(categoryType)?.includes(noteType)) return BAD_INPUT;

  const inserted = await pool.query(
    `INSERT INTO judge_notes (id, event_id, team_id, player_id, category_type, note_type, routine_started_at, noted_at)
     SELECT $1::uuid, e.id, s.team_id, $3::uuid, $4::text, $5::text, s.routine_started_at,
            LEAST(now(), GREATEST(s.routine_started_at, to_timestamp($6::float8 / 1000.0)))
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     WHERE e.id = $2 AND e.is_playing
       AND s.team_id IS NOT NULL AND s.routine_started_at IS NOT NULL
       AND abs(extract(epoch FROM s.routine_started_at)::float8 * 1000 - $8::float8) < 2
       AND EXISTS (
         SELECT 1 FROM pool_judges j
         WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
           AND j.player_id = $3 AND j.category_type = $4)
       AND (SELECT count(*) FROM judge_notes x
            WHERE x.event_id = e.id AND x.player_id = $3 AND x.category_type = $4
              AND x.routine_started_at = s.routine_started_at) < $7
     ON CONFLICT (id) DO NOTHING`,
    [noteId, eventId, playerId, categoryType, noteType, clickedAt, MAX_NOTES_PER_ROUTINE, routineStartedAt]
  );
  if (inserted.rowCount === 1) return { error: null };

  // Nothing was stored: either this note is already saved (a resend), or it was refused.
  const why = await pool.query<{ saved: boolean; playing: boolean; judging: boolean; running: boolean; same: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM judge_notes WHERE id = $1) AS saved,
            COALESCE(e.is_playing, false) AS playing,
            COALESCE(s.team_id IS NOT NULL AND s.routine_started_at IS NOT NULL, false) AS running,
            COALESCE(abs(extract(epoch FROM s.routine_started_at)::float8 * 1000 - $5::float8) < 2, false) AS same,
            COALESCE(EXISTS (
              SELECT 1 FROM pool_judges j
              WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                AND j.player_id = $3 AND j.category_type = $4), false) AS judging
     FROM (SELECT 1) one
     LEFT JOIN events e ON e.id = $2
     LEFT JOIN event_play_state s ON s.event_id = e.id`,
    [noteId, eventId, playerId, categoryType, routineStartedAt]
  );
  const r = why.rows[0];
  if (r.saved) return { error: null };
  if (!r.playing || !r.judging) return { error: "You're not judging right now" };
  if (!r.running) return { error: 'No routine is running' };
  if (!r.same) return { error: 'That routine was restarted, so the note was not saved' };
  return { error: 'Too many notes for this routine' };
}

// Removes one of this judge's own notes (undo). Safe to repeat.
export async function deleteNote(
  eventId: string,
  playerId: string,
  categoryType: string,
  noteId: string
): Promise<NoteActionResult> {
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(noteId)) return BAD_INPUT;
  if (!noteTypesFor(categoryType)) return BAD_INPUT;
  await pool.query(
    'DELETE FROM judge_notes WHERE id = $1 AND event_id = $2 AND player_id = $3 AND category_type = $4',
    [noteId, eventId, playerId, categoryType]
  );
  return { error: null };
}
