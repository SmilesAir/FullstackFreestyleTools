import 'server-only';
import { pool } from './db';
import type { BackupKind } from './backup';

export type BackupListItem = {
  id: string;
  filename: string;
  size_bytes: string;
  kind: BackupKind;
  created_at: string;
};

export async function listBackups(): Promise<BackupListItem[]> {
  const result = await pool.query<BackupListItem>(
    'SELECT id, filename, size_bytes, kind, created_at FROM backups ORDER BY created_at DESC'
  );
  return result.rows;
}

// Only for server-side use (route handlers / actions) — includes blob_url,
// which must never be sent to the client.
export async function getBackupWithUrl(id: string) {
  const result = await pool.query<{ id: string; filename: string; blob_url: string }>(
    'SELECT id, filename, blob_url FROM backups WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}
