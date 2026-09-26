import { headJudgeGuard, isUuid } from '@/lib/db-guard';
import { switchMode } from '@/lib/db-switch';

// Switches the whole server between the local Postgres and Neon (syncing first).
// Body: { target: 'local' | 'remote', eventId?: string, force?: boolean }
export async function POST(request: Request) {
  const denied = await headJudgeGuard();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { target?: unknown; eventId?: unknown; force?: unknown } | null;
  if (!body || (body.target !== 'local' && body.target !== 'remote')) {
    return Response.json({ ok: false, message: 'Choose local or remote.' }, { status: 400 });
  }
  if (body.eventId !== undefined && body.eventId !== null && !isUuid(body.eventId)) {
    return Response.json({ ok: false, message: 'Unknown event.' }, { status: 400 });
  }

  try {
    const result = await switchMode(body.target, { eventId: (body.eventId as string | null | undefined) ?? null, force: body.force === true });
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, message: err instanceof Error ? err.message : 'Could not switch' }, { status: 500 });
  }
}
