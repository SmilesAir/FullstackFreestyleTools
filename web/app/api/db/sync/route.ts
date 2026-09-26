import { getMode, getModeState, localConfigured } from '@/lib/db-mode';
import { headJudgeGuard, isUuid } from '@/lib/db-guard';
import { fullSync, pushOnly, syncCycle } from '@/lib/local-sync';

// Body: { action: 'sync' }                        sync now (in local mode: send, then refresh the setup)
//       { action: 'take-offline', eventId }       choose the local event and download it completely
export async function POST(request: Request) {
  const denied = await headJudgeGuard();
  if (denied) return denied;
  if (!localConfigured()) {
    return Response.json({ ok: false, message: 'This server has no local database (LOCAL_DATABASE_URL is not set).' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown; eventId?: unknown } | null;
  try {
    if (body?.action === 'take-offline') {
      if (!isUuid(body.eventId)) return Response.json({ ok: false, message: 'Choose an event.' }, { status: 400 });
      const previous = getModeState().localEventId;
      // Another event's unsent changes go up before it is left behind.
      if (previous && previous !== body.eventId) {
        const sent = await pushOnly();
        if (!sent.ok) return Response.json({ ok: false, message: `Could not send the previous event's changes: ${sent.message}` });
      }
      // A full download replaces the local copy, which would pull the rug from under
      // the judges while they are writing to it: only while Neon is in use.
      if (getMode() === 'local') {
        return Response.json({ ok: false, message: 'Switch to Postgres before downloading the event again.' });
      }
      const result = await fullSync(body.eventId);
      return Response.json({ ok: result.ok, message: result.message });
    }
    if (body?.action === 'sync') {
      // Only the local server has anything to send: on Neon, judging is saved there directly.
      if (getMode() !== 'local') return Response.json({ ok: true, message: 'Using Postgres (Neon): nothing to sync.' });
      const result = await syncCycle();
      return Response.json({ ok: result.ok, message: result.message });
    }
    return Response.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, message: err instanceof Error ? err.message : 'Could not sync' }, { status: 500 });
  }
}
