import 'server-only';
import { pool } from './db';

export async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value ?? null;
}

export async function getAllSettings(): Promise<Record<string, string | null>> {
  const result = await pool.query<{ key: string; value: string | null }>('SELECT key, value FROM app_settings');
  return Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
}
