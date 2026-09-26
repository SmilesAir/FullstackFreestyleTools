import { getCurrentUserAccess } from '@/lib/authz';
import { POOL_LETTERS } from '@/lib/event-creator';
import { getPoolResults } from '@/lib/head-judge-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A pool's results (each judge's notes and score per team), for the Head Judge
// page to poll. /api isn't covered by the proxy matcher, so the permission is
// checked here.
export async function GET(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.isAdmin && !access.permissions.has('head_judge')) {
    return Response.json({ error: 'No access' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const divisionId = params.get('division') ?? '';
  const round = Number(params.get('round'));
  const letter = params.get('pool') ?? '';
  if (
    !UUID.test(eventId) ||
    !UUID.test(divisionId) ||
    !Number.isInteger(round) ||
    round < 1 ||
    !(POOL_LETTERS as readonly string[]).includes(letter)
  ) {
    return Response.json({ error: 'Missing or invalid event, division, round or pool' }, { status: 400 });
  }

  try {
    return Response.json(await getPoolResults(eventId, divisionId, round, letter), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the results' }, { status: 500 });
  }
}
