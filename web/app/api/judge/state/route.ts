import { noteTypesFor } from '@/lib/judging';
import { getJudgeState } from '@/lib/judging-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A judge's live state, polled by the judge screens. Public on purpose (judges
// don't log in) and it only returns what the landing page and that judge's own
// notes already show. /api isn't behind the login proxy.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const playerId = params.get('player') ?? '';
  const category = params.get('category') ?? '';
  if (!UUID.test(eventId) || !UUID.test(playerId) || !noteTypesFor(category)) {
    return Response.json({ error: 'Missing or invalid event, player or category' }, { status: 400 });
  }

  try {
    return Response.json(await getJudgeState(eventId, playerId, category), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the state' }, { status: 500 });
  }
}
