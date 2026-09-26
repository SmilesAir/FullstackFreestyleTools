import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { dumpDatabase } from './backup';
import { getPool } from './db';
import { localDir } from './db-mode';

// Safety copies of the local database, kept on the laptop's disk (no internet
// needed) and taken just before a sync overwrites anything in it.
const KEEP = 20;
const dir = () => path.join(localDir(), 'backups');

export type LocalBackup = { file: string; at: number; bytes: number };

let lastBackupAt = 0;

// Writes a backup of the local database now. `minGapMs` skips it when one was
// taken that recently (returns null); a failure throws so the caller can hold
// its overwrite back.
export async function backupLocal(minGapMs = 0): Promise<LocalBackup | null> {
  if (minGapMs > 0 && Date.now() - lastBackupAt < minGapMs) return null;
  const buffer = await dumpDatabase(getPool('local'));
  fs.mkdirSync(dir(), { recursive: true });
  const at = Date.now();
  const file = `local-${new Date(at).toISOString().replace(/[:.]/g, '-')}.json.gz`;
  fs.writeFileSync(path.join(dir(), file), buffer);
  lastBackupAt = at;
  prune();
  return { file, at, bytes: buffer.length };
}

export function listLocalBackups(): LocalBackup[] {
  try {
    return fs
      .readdirSync(dir())
      .filter((f) => f.startsWith('local-') && f.endsWith('.json.gz'))
      .map((file) => {
        const stat = fs.statSync(path.join(dir(), file));
        return { file, at: stat.mtimeMs, bytes: stat.size };
      })
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

function prune() {
  for (const old of listLocalBackups().slice(KEEP)) {
    try {
      fs.unlinkSync(path.join(dir(), old.file));
    } catch {
      // Already gone.
    }
  }
}
