import { noteTypesFor } from '@/lib/judging';
import { getOtherJudgeCurves } from '@/lib/judging-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The other categories' judges, averaged, for one routine of the asking judge:
// what the Enter Score dialog draws under the judge's own graph. Public on
// purpose like /api/judge/history: only category averages leave (never one
// judge's notes or name), and only for a routine the judge has notes or a score
// for, or that is running.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const playerId = params.get('player') ?? '';
  const category = params.get('category') ?? '';
  const routineId = params.get('routine') ?? '';
  if (!UUID.test(eventId) || !UUID.test(playerId) || !UUID.test(routineId) || !noteTypesFor(category)) {
    return Response.json({ error: 'Missing or invalid event, player, category or routine' }, { status: 400 });
  }

  try {
    const others = await getOtherJudgeCurves(eventId, playerId, category, [routineId]);
    return Response.json(others[routineId] ?? [], { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the other judges' }, { status: 500 });
  }
}
