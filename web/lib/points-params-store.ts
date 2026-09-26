import 'server-only';
import { pool } from './db';
import { DEFAULT_PARAMS, resolveParams, type PointsParams } from './points/params';

// The Rankings Generator's saved defaults: one JSON value in app_settings, shared
// by everyone with the tool. Whatever is stored is read leniently (each bad or
// missing field falls back to its default), so an older or damaged value never
// breaks the tool.
const KEY = 'points_generator_params';

export async function getSavedParams(): Promise<PointsParams> {
  const result = await pool.query<{ value: string | null }>('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  const raw = result.rows[0]?.value;
  if (!raw) return DEFAULT_PARAMS;
  try {
    return resolveParams(JSON.parse(raw));
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function saveParams(params: PointsParams): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, JSON.stringify(params)]
  );
}
