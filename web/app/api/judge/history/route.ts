import { noteTypesFor } from '@/lib/judging';
import { getJudgeHistory } from '@/lib/judging-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A judge's Review tab list: every routine they took notes on or scored in the
// event, and every team of the pool they are judging now, in the order they
// play. Public on purpose like /api/judge/state: it only returns that judge's
// own notes and scores, and team names the judge screens already show.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const playerId = params.get('player') ?? '';
  const category = params.get('category') ?? '';
  if (!UUID.test(eventId) || !UUID.test(playerId) || !noteTypesFor(category)) {
    return Response.json({ error: 'Missing or invalid event, player or category' }, { status: 400 });
  }

  try {
    return Response.json(await getJudgeHistory(eventId, playerId, category), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the routines' }, { status: 500 });
  }
}
