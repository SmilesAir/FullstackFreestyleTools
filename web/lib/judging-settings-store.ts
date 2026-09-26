import 'server-only';
import { pool } from './db';
import {
  TUNABLE_SYSTEMS,
  hasTunables,
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

// Replaces one system's settings for the event; other systems are untouched.
export async function saveEventSettings(eventId: string, rulesId: string, values: unknown): Promise<{ error: string | null }> {
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const checked = validateSettings(rulesId, values);
  if ('error' in checked) return { error: checked.error };
  const result = await pool.query(
    `UPDATE events
     SET judging_settings = jsonb_set(COALESCE(judging_settings, '{}'::jsonb), ARRAY[$2::text], $3::jsonb, true)
     WHERE id = $1`,
    [eventId, rulesId, JSON.stringify(checked.settings)]
  );
  return result.rowCount === 0 ? { error: 'Unknown event' } : { error: null };
}

// Only the presets of the given systems are read.
export async function listPresets(rulesIds: string[]): Promise<Preset[]> {
  if (rulesIds.length === 0) return [];
  const result = await pool.query<{ id: string; rules_id: string; name: string; settings: unknown }>(
    'SELECT id, rules_id, name, settings FROM judging_presets WHERE rules_id = ANY($1::text[]) ORDER BY lower(name), name',
    [rulesIds]
  );
  return result.rows.map((r) => ({
    id: r.id,
    rulesId: r.rules_id,
    name: r.name,
    settings: resolveSettings(r.rules_id, r.settings),
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
