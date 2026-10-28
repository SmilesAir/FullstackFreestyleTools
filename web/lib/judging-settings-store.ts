import 'server-only';
import type { PoolClient } from 'pg';
import { pool } from './db';
import { noteCategoryOf } from './judging';
import { adjustedScore, estimateFromNotes } from './judging-estimate';
import {
  OFFICIAL_PRESET,
  TUNABLE_SYSTEMS,
  adjustUnit,
  categorySettings,
  defaultSettings,
  hasTunables,
  sameSettings,
  scoreLimitOf,
  resolveEventSettings,
  resolveSettings,
  validateSettings,
  type Preset,
  type SystemSettings,
} from './judging-settings';
import { DEFAULT_NEW_RULES_ID } from './event-creator';

// The logic behind the head judge's Settings tab. No permission check here on
// purpose (judging-settings-actions.ts adds it) so it can be tested directly.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_PRESET_NAME = 60;

// The judging systems the event's divisions use that have tunables. An event
// with none yet (no divisions, or only rules without tunables) gets every
// system that has tunables, so settings can still be prepared.
// `current` is the one to show first: the playing division's rules, else the
// rules most of the event's divisions use, else the rules new divisions get.
export async function getEventSystems(eventId: string): Promise<{ systems: string[]; current: string }> {
  const result = await pool.query<{ rules_id: string; divisions: number; playing: boolean }>(
    `SELECT d.rules_id, count(*)::int AS divisions, coalesce(bool_or(d.id = s.division_id), false) AS playing
     FROM divisions d
     LEFT JOIN event_play_state s ON s.event_id = d.event_id
     WHERE d.event_id = $1
     GROUP BY d.rules_id
     ORDER BY d.rules_id`,
    [eventId]
  );
  const used = result.rows.filter((r) => hasTunables(r.rules_id));
  const systems = used.length > 0 ? used.map((r) => r.rules_id) : [...TUNABLE_SYSTEMS];
  const byUse = [...used].sort((a, b) => b.divisions - a.divisions);
  const current =
    used.find((r) => r.playing)?.rules_id ??
    byUse[0]?.rules_id ??
    (systems.includes(DEFAULT_NEW_RULES_ID) ? DEFAULT_NEW_RULES_ID : systems[0]);
  return { systems, current };
}

// The event's settings for each system, defaults filled in.
export async function getEventSettings(eventId: string, rulesIds: string[]): Promise<Record<string, SystemSettings>> {
  const result = await pool.query<{ judging_settings: unknown }>('SELECT judging_settings FROM events WHERE id = $1', [
    eventId,
  ]);
  const blob = result.rows[0]?.judging_settings ?? {};
  return Object.fromEntries(rulesIds.map((id) => [id, resolveEventSettings(id, blob)]));
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Writes one system's settings into the event and rescores its results already
// in (see rescoreResults). With `onlyIfChanged`, settings the event already has
// are left alone and nothing is rescored. Returns how many scores were
// rescored, or null for an unknown event.
async function applyEventSettings(
  client: PoolClient,
  eventId: string,
  rulesId: string,
  settings: SystemSettings,
  onlyIfChanged: boolean
): Promise<number | null> {
  const current = await client.query<{ judging_settings: unknown }>(
    'SELECT judging_settings FROM events WHERE id = $1 FOR UPDATE',
    [eventId]
  );
  if (!current.rows[0]) return null;
  if (onlyIfChanged && sameSettings(resolveEventSettings(rulesId, current.rows[0].judging_settings), settings)) return 0;
  await client.query(
    `UPDATE events
     SET judging_settings = jsonb_set(COALESCE(judging_settings, '{}'::jsonb), ARRAY[$2::text], $3::jsonb, true)
     WHERE id = $1`,
    [eventId, rulesId, JSON.stringify(settings)]
  );
  return rescoreResults(client, eventId, rulesId, settings);
}

// Replaces one system's settings for the event; other systems are untouched.
// The event's results already in follow the new settings; `rescored` is how
// many scores that changed.
export async function saveEventSettings(
  eventId: string,
  rulesId: string,
  values: unknown
): Promise<{ error: string | null; rescored?: number }> {
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const checked = validateSettings(rulesId, values);
  if ('error' in checked) return { error: checked.error };
  const rescored = await inTransaction((client) => applyEventSettings(client, eventId, rulesId, checked.settings, false));
  return rescored === null ? { error: 'Unknown event' } : { error: null, rescored };
}

// The Fpa-Official preset's settings for one system. A system without one gets
// it made from the defaults, so it shows in the presets list to tune.
async function officialSettings(rulesId: string): Promise<SystemSettings> {
  await pool.query(
    `INSERT INTO judging_presets (rules_id, name, settings) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (rules_id, lower(name)) DO NOTHING`,
    [rulesId, OFFICIAL_PRESET, JSON.stringify(defaultSettings(rulesId))]
  );
  const result = await pool.query<{ settings: unknown }>(
    'SELECT settings FROM judging_presets WHERE rules_id = $1 AND lower(name) = lower($2)',
    [rulesId, OFFICIAL_PRESET]
  );
  return resolveSettings(rulesId, result.rows[0]?.settings);
}

// A new event's settings: the Fpa-Official preset of every system. It has no
// routines yet, so there is nothing to rescore.
export async function applyOfficialPreset(eventId: string): Promise<void> {
  const blob: Record<string, SystemSettings> = {};
  for (const rulesId of TUNABLE_SYSTEMS) blob[rulesId] = await officialSettings(rulesId);
  await pool.query(`UPDATE events SET judging_settings = COALESCE(judging_settings, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [
    eventId,
    JSON.stringify(blob),
  ]);
}

// Makes the event's preset of one system from `settings`, named after the event
// and its start date (with " (2)", " (3)"... if that name is taken). Does
// nothing if the event already has one.
async function insertEventPreset(client: PoolClient, eventId: string, rulesId: string, settings: SystemSettings): Promise<void> {
  const event = await client.query<{ event_name: string; start_date: string }>(
    'SELECT event_name, start_date::text FROM events WHERE id = $1',
    [eventId]
  );
  if (!event.rows[0]) return;
  // Room for the date and a " (20)" within the longest name allowed.
  const base = `${event.rows[0].event_name.slice(0, MAX_PRESET_NAME - 16).trim()} ${event.rows[0].start_date}`;
  for (let n = 1; n <= 20; n++) {
    const inserted = await client.query(
      `INSERT INTO judging_presets (rules_id, name, settings, event_id) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [rulesId, n === 1 ? base : `${base} (${n})`, JSON.stringify(settings), eventId]
    );
    if (inserted.rowCount !== 0) return;
    const own = await client.query('SELECT 1 FROM judging_presets WHERE event_id = $1 AND rules_id = $2', [eventId, rulesId]);
    if (own.rows.length > 0) return;
  }
}

// Gives the event an event preset, from its settings now, for each judging
// system its divisions use that doesn't have one. Called when a routine starts,
// so the first routine makes them; safe to repeat.
export async function ensureEventPresets(eventId: string): Promise<void> {
  const missing = await pool.query<{ rules_id: string }>(
    `SELECT DISTINCT d.rules_id FROM divisions d
     WHERE d.event_id = $1
       AND NOT EXISTS (SELECT 1 FROM judging_presets p WHERE p.event_id = d.event_id AND p.rules_id = d.rules_id)`,
    [eventId]
  );
  const rulesIds = missing.rows.map((r) => r.rules_id).filter(hasTunables);
  if (rulesIds.length === 0) return;
  const saved = await getEventSettings(eventId, rulesIds);
  await inTransaction(async (client) => {
    for (const rulesId of rulesIds) await insertEventPreset(client, eventId, rulesId, saved[rulesId]);
  });
}

// Loads the event's presets back into the event (when the head judge chooses
// it): changes saved to the event but not to its preset are undone, and its
// results rescored to match. An event without event presets is left as is.
// Returns how many scores were rescored.
export async function loadEventPresets(eventId: string): Promise<number> {
  if (!UUID.test(eventId)) return 0;
  const presets = await pool.query<{ rules_id: string; settings: unknown }>(
    'SELECT rules_id, settings FROM judging_presets WHERE event_id = $1',
    [eventId]
  );
  let rescored = 0;
  for (const p of presets.rows) {
    const settings = resolveSettings(p.rules_id, p.settings);
    rescored += (await inTransaction((client) => applyEventSettings(client, eventId, p.rules_id, settings, true))) ?? 0;
  }
  return rescored;
}

// Saves the values into the event (rescoring its results) and into its event
// preset, made now if it has none yet.
export async function updateEventPreset(
  eventId: string,
  rulesId: string,
  values: unknown
): Promise<{ error: string | null; rescored?: number }> {
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const checked = validateSettings(rulesId, values);
  if ('error' in checked) return { error: checked.error };
  const rescored = await inTransaction(async (client) => {
    const count = await applyEventSettings(client, eventId, rulesId, checked.settings, false);
    if (count === null) return null;
    const updated = await client.query(
      'UPDATE judging_presets SET settings = $3::jsonb, updated_at = now() WHERE event_id = $1 AND rules_id = $2',
      [eventId, rulesId, JSON.stringify(checked.settings)]
    );
    if (updated.rowCount === 0) await insertEventPreset(client, eventId, rulesId, checked.settings);
    return count;
  });
  return rescored === null ? { error: 'Unknown event' } : { error: null, rescored };
}

// Works out the event's results already in again with `settings`, for the
// divisions on `rulesId`: each Difficulty note's numberline score and multiplier,
// then each submitted score's baseline. The judge's change from the baseline is
// kept as the same percentage, so the score moves with the baseline. Pool locks
// don't stop it. Returns how many scores it rescored.
async function rescoreResults(client: PoolClient, eventId: string, rulesId: string, settings: SystemSettings): Promise<number> {
  const diff = settings.Diff;
  if (diff?.line) {
    await client.query(
      `UPDATE fpa2027_judge_notes n
       SET line_value = round(n.line_position * $3::numeric, 4),
           multiplier = ($4::jsonb ->> n.note_type)::numeric
       FROM routines r JOIN divisions d ON d.id = r.division_id
       WHERE n.routine_id = r.id AND r.event_id = $1 AND d.rules_id = $2
         AND n.category_type = 'Diff' AND n.line_position IS NOT NULL AND $4::jsonb ? n.note_type`,
      [eventId, rulesId, diff.line.max, JSON.stringify(diff.noteWeights)]
    );
  }

  const [scores, notes] = await Promise.all([
    client.query<{
      routine_id: string;
      judge_player_id: string;
      category_type: string;
      adjust_percent: string;
      started_ms: number;
      routine_seconds: number;
    }>(
      `SELECT sc.routine_id, sc.judge_player_id, sc.category_type, sc.adjust_percent,
              extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms, d.routine_seconds
       FROM fpa2027_judge_scores sc
       JOIN routines r ON r.id = sc.routine_id
       JOIN divisions d ON d.id = r.division_id
       WHERE r.event_id = $1 AND d.rules_id = $2`,
      [eventId, rulesId]
    ),
    client.query<{
      routine_id: string;
      player_id: string;
      category_type: string;
      note_type: string;
      noted_ms: number;
      line_value: string | null;
      multiplier: string | null;
    }>(
      `SELECT n.routine_id, n.player_id, n.category_type, n.note_type,
              extract(epoch FROM n.noted_at)::float8 * 1000 AS noted_ms, n.line_value, n.multiplier
       FROM fpa2027_judge_notes n
       JOIN routines r ON r.id = n.routine_id
       JOIN divisions d ON d.id = r.division_id
       WHERE r.event_id = $1 AND d.rules_id = $2
       ORDER BY n.noted_at, n.id`,
      [eventId, rulesId]
    ),
  ]);

  // The same notes a score is made from when it is submitted (judging-actions.ts).
  const key = (routineId: string, playerId: string, category: string) => `${routineId}:${playerId}:${category}`;
  const notesByJudge = new Map<string, { noteType: string; notedAt: number; lineValue?: number; multiplier?: number }[]>();
  for (const n of notes.rows) {
    const k = key(n.routine_id, n.player_id, n.category_type);
    const list = notesByJudge.get(k) ?? [];
    list.push({
      noteType: n.note_type,
      notedAt: Math.round(n.noted_ms),
      ...(n.line_value !== null && n.multiplier !== null
        ? { lineValue: Number(n.line_value), multiplier: Number(n.multiplier) }
        : {}),
    });
    notesByJudge.set(k, list);
  }

  let rescored = 0;
  for (const s of scores.rows) {
    const category = noteCategoryOf(s.category_type);
    const own = categorySettings(settings, s.category_type);
    if (!category || !own) continue;
    const baseline = estimateFromNotes(
      notesByJudge.get(key(s.routine_id, s.judge_player_id, s.category_type)) ?? [],
      Math.round(s.started_ms),
      s.routine_seconds,
      own.noteWeights,
      own.estimate,
      category,
      scoreLimitOf(own)
    ).baseline;
    await client.query(
      `UPDATE fpa2027_judge_scores
       SET baseline_estimate = $4, score = $5, settings = $6::jsonb
       WHERE routine_id = $1 AND judge_player_id = $2 AND category_type = $3`,
      [
        s.routine_id,
        s.judge_player_id,
        s.category_type,
        baseline,
        adjustedScore(baseline, Number(s.adjust_percent), adjustUnit(category, own)),
        JSON.stringify({ rulesId, [s.category_type]: own }),
      ]
    );
    rescored++;
  }
  return rescored;
}

// Only the presets of the given systems are read.
export async function listPresets(rulesIds: string[]): Promise<Preset[]> {
  if (rulesIds.length === 0) return [];
  const result = await pool.query<{ id: string; rules_id: string; name: string; settings: unknown; event_id: string | null }>(
    `SELECT id, rules_id, name, settings, event_id FROM judging_presets
     WHERE rules_id = ANY($1::text[]) ORDER BY lower(name), name`,
    [rulesIds]
  );
  return result.rows.map((r) => ({
    id: r.id,
    rulesId: r.rules_id,
    name: r.name,
    settings: resolveSettings(r.rules_id, r.settings),
    eventId: r.event_id,
  }));
}

// Saves the values as a named preset of one system. If the name is taken
// (ignoring case) nothing changes and `exists` is set, unless `overwrite`
// says to replace that preset's values.
export async function savePreset(
  rulesId: string,
  name: string,
  values: unknown,
  overwrite: boolean
): Promise<{ error: string | null; exists?: boolean }> {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return { error: 'Give the preset a name' };
  if (trimmed.length > MAX_PRESET_NAME) return { error: `The name can be at most ${MAX_PRESET_NAME} characters` };
  const checked = validateSettings(rulesId, values);
  if ('error' in checked) return { error: checked.error };

  const json = JSON.stringify(checked.settings);
  const result = overwrite
    ? await pool.query(
        `INSERT INTO judging_presets (rules_id, name, settings) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (rules_id, lower(name)) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()
         RETURNING id`,
        [rulesId, trimmed, json]
      )
    : await pool.query(
        `INSERT INTO judging_presets (rules_id, name, settings) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (rules_id, lower(name)) DO NOTHING
         RETURNING id`,
        [rulesId, trimmed, json]
      );
  return result.rowCount === 0 ? { error: null, exists: true } : { error: null };
}

export async function deletePreset(id: string): Promise<{ error: string | null }> {
  if (!UUID.test(id)) return { error: 'Unknown preset' };
  await pool.query('DELETE FROM judging_presets WHERE id = $1', [id]);
  return { error: null };
}
