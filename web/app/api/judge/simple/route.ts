import { getMode } from '@/lib/db-mode';
import { getOwnBallot, getPlayingSimpleRankingPool } from '@/lib/simple-ranking-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-z0-9-]{8,64}$/i;

// The Simple Ranking judge screen's poll: public, no login (like /api/judge/state).
// The playing pool's teams in play order, and this judge's own saved ranking for
// it (null if they haven't sent one yet), so a refresh or a new device on the
// same token picks up where it left off.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const judgeToken = params.get('judge') ?? '';
  if (!UUID.test(eventId) || !TOKEN.test(judgeToken)) {
    return Response.json({ error: 'Missing or invalid event or judge id' }, { status: 400 });
  }

  try {
    const playing = await getPlayingSimpleRankingPool(eventId);
    if (!playing) return Response.json({ pool: null, ranking: null, mode: getMode() }, { headers: { 'Cache-Control': 'no-store' } });

    const ranking = await getOwnBallot(playing.divisionId, playing.roundNumber, playing.poolLetter, judgeToken);
    return Response.json(
      {
        pool: { key: `${playing.divisionId}:${playing.roundNumber}:${playing.poolLetter}`, title: playing.poolTitle, teams: playing.teams },
        ranking,
        mode: getMode(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the pool' }, { status: 500 });
  }
}
