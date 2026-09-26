// Starts the local server's periodic sync with Neon (it does nothing until a
// local database is set up and in use).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startSyncLoop } = await import('./lib/sync-loop');
  startSyncLoop();
}
