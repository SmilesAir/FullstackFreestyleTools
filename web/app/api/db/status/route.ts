import { getMode, localConfigured } from '@/lib/db-mode';
import { getDbStatus, pingDb } from '@/lib/db-diagnostics';
import { isSyncing } from '@/lib/local-sync';
import { headJudgeGuard, isUuid } from '@/lib/db-guard';

// Which database the server is using and how healthy each is. `?public=1` gives
// only the mode (a judge's screen may show it); the rest is for head judges
// (`?lite=1` is just the active database's ping).
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('public')) {
    return Response.json({ mode: getMode() }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const denied = await headJudgeGuard();
  if (denied) return denied;

  // The cheap version the closed control polls: the active database's round trip.
  if (url.searchParams.get('lite')) {
    const mode = getMode();
    return Response.json(
      { mode, configured: localConfigured(), syncing: isSyncing(), active: await pingDb(mode) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const event = url.searchParams.get('event');
  try {
    return Response.json(await getDbStatus({ eventId: isUuid(event) ? event : null, port: url.port || '3000' }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Could not read the status' }, { status: 500 });
  }
}
