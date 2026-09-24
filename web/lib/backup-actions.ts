'use server';

import { requireAdmin } from './authz';
import { pool } from './db';
import { createBackup, restoreFromBuffer, validateBackupBuffer, fetchBackupBuffer, deleteBackupBlob } from './backup';
import { getBackupWithUrl } from './backup-queries';
import { put } from '@vercel/blob';

export type ActionState = { error: string | null };

export async function createBackupAction(): Promise<ActionState> {
  await requireAdmin();
  try {
    await createBackup('manual');
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create backup' };
  }
}

export async function uploadBackupAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a backup file to upload' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    validateBackupBuffer(buffer);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid backup file' };
  }

  const filename = file.name.endsWith('.json.gz') ? file.name : `${file.name}.json.gz`;
  const blob = await put(filename, buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/gzip',
  });

  await pool.query(`INSERT INTO backups (filename, blob_url, size_bytes, kind) VALUES ($1, $2, $3, 'uploaded')`, [
    filename,
    blob.url,
    buffer.length,
  ]);

  return { error: null };
}

export async function restoreBackupAction(backupId: string): Promise<ActionState> {
  await requireAdmin();

  const backup = await getBackupWithUrl(backupId);
  if (!backup) return { error: 'Backup not found' };

  try {
    const buffer = await fetchBackupBuffer(backup.blob_url);
    // Safety snapshot of current state before we overwrite anything, so
    // there's always an undo path in the list.
    await createBackup('pre_restore');
    await restoreFromBuffer(buffer);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Restore failed' };
  }
}

export async function deleteBackupAction(backupId: string): Promise<ActionState> {
  await requireAdmin();

  const backup = await getBackupWithUrl(backupId);
  if (!backup) return { error: 'Backup not found' };

  await deleteBackupBlob(backup.blob_url);
  await pool.query('DELETE FROM backups WHERE id = $1', [backupId]);

  return { error: null };
}
