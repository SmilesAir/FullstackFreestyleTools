import 'server-only';
import { getMode, localConfigured } from './db-mode';
import { syncCycle } from './local-sync';

// While the server is on the local database, sends judging data to Neon and
// refreshes the event setup from it every LOCAL_SYNC_INTERVAL_SECONDS (30).
const globalForLoop = globalThis as unknown as { syncLoop?: ReturnType<typeof setInterval> };

export function startSyncLoop() {
  if (globalForLoop.syncLoop) return;
  const seconds = Math.max(5, Number(process.env.LOCAL_SYNC_INTERVAL_SECONDS) || 30);
  globalForLoop.syncLoop = setInterval(() => {
    // The local address may be set later on the Head Judge page: nothing to do until then.
    if (!localConfigured() || getMode() !== 'local') return;
    syncCycle().catch(() => {
      // Already running, or recorded as the last sync's result.
    });
  }, seconds * 1000);
  globalForLoop.syncLoop.unref?.();
}
