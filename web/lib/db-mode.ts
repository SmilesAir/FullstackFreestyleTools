import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// Which database the whole server talks to. 'remote' is Neon (DATABASE_URL);
// 'local' is the Postgres on the head judge's laptop (LOCAL_DATABASE_URL). The
// mode is server-wide (every screen switches at once), kept on globalThis so
// every bundle of the server sees one value, and mirrored to a file so a
// restart of the laptop's server keeps it. Where LOCAL_DATABASE_URL is not set
// (the hosted site) the mode is always 'remote'.
export type DbMode = 'remote' | 'local';

export type SyncResult = {
  at: number; // ms since epoch
  kind: 'push' | 'pull' | 'full';
  ok: boolean;
  message: string;
  pushed?: number;
};

export type ModeState = {
  mode: DbMode;
  // The local database's connection string as set on the Head Judge page. It
  // wins over LOCAL_DATABASE_URL, and lives only in this computer's .local folder.
  localUrl: string | null;
  // The event kept in step with Neon (the "local event").
  localEventId: string | null;
  // The structure fingerprint of the setup last pulled from Neon.
  pulledStructureKey: string;
  // When the local copy of the event was last completely brought up to date.
  lastFullAt: number | null;
  lastSync: SyncResult | null;
};

const DEFAULT_STATE: ModeState = {
  mode: 'remote',
  localUrl: null,
  localEventId: null,
  pulledStructureKey: '',
  lastFullAt: null,
  lastSync: null,
};

const globalForMode = globalThis as unknown as { dbModeState?: ModeState };

export const localDir = () => path.join(process.cwd(), '.local');
const stateFile = () => path.join(localDir(), 'db-mode.json');

// The local database's connection string, and where it came from (null = none).
export function getLocalUrl(): string | null {
  return getModeState().localUrl || process.env.LOCAL_DATABASE_URL || null;
}

export const localUrlSource = (): 'settings' | 'env' | null =>
  getModeState().localUrl ? 'settings' : process.env.LOCAL_DATABASE_URL ? 'env' : null;

export const localConfigured = () => getLocalUrl() !== null;

function load(): ModeState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Partial<ModeState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function getModeState(): ModeState {
  if (!globalForMode.dbModeState) globalForMode.dbModeState = load();
  return globalForMode.dbModeState;
}

export function updateModeState(patch: Partial<ModeState>): ModeState {
  const next = { ...getModeState(), ...patch };
  globalForMode.dbModeState = next;
  try {
    fs.mkdirSync(localDir(), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2));
  } catch {
    // The file is only a convenience for restarts; the value in memory still holds.
  }
  return next;
}

export function getMode(): DbMode {
  return localConfigured() && getModeState().mode === 'local' ? 'local' : 'remote';
}
