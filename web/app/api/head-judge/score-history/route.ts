import { getCurrentUserAccess } from '@/lib/authz';
import { pool } from '@/lib/db';
import { noteCategoryOf } from '@/lib/judging';
import { getScoreHistory } from '@/lib/score-history';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every version of one judge's score for one routine, oldest first, for the
// Head Judge's Results tab. /api isn't covered by the proxy matcher, so the
// permission is checked here.
export async function GET(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.isAdmin && !access.permissions.has('head_judge')) {
    return Response.json({ error: 'No access' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const routineId = params.get('routine') ?? '';
  const playerId = params.get('judge') ?? '';
  const category = params.get('category') ?? '';
  if (!UUID.test(routineId) || !UUID.test(playerId) || !noteCategoryOf(category)) {
    return Response.json({ error: 'Missing or invalid routine, judge or category' }, { status: 400 });
  }

  try {
    return Response.json(await getScoreHistory(pool, routineId, playerId, category), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'Could not read the history' }, { status: 500 });
  }
}
