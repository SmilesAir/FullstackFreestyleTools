import { getCurrentUserAccess } from '@/lib/authz';
import { POOL_LETTERS } from '@/lib/event-creator';
import { getDivision } from '@/lib/event-creator-queries';
import { getSimpleRankingResults } from '@/lib/simple-ranking-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A Simple Ranking pool's aggregated results, for the Head Judge page to poll.
export async function GET(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.isAdmin && !access.permissions.has('head_judge')) {
    return Response.json({ error: 'No access' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const divisionId = params.get('division') ?? '';
  const round = Number(params.get('round'));
  const letter = params.get('pool') ?? '';
  if (!UUID.test(divisionId) || !Number.isInteger(round) || round < 1 || !(POOL_LETTERS as readonly string[]).includes(letter)) {
    return Response.json({ error: 'Missing or invalid division, round or pool' }, { status: 400 });
  }

  try {
    const division = await getDivision(divisionId);
    if (!division) return Response.json({ error: 'Division not found' }, { status: 404 });
    return Response.json(await getSimpleRankingResults(divisionId, division.division_name, round, letter), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the results' }, { status: 500 });
  }
}
