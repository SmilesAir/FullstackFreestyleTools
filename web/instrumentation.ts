// Starts the local server's periodic sync with Neon (only where a local
// database is set up).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startSyncLoop } = await import('./lib/sync-loop');
  startSyncLoop();
}
