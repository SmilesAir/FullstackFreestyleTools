'use server';

import { requirePermission } from './authz';
import { poolId } from './event-creator';
import { isPoolLocked, POOL_LOCKED_ERROR } from './pool-locks';
import { deleteBallots, getPlayingSimpleRankingPool, saveBallot } from './simple-ranking-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The judge screen makes this up once and keeps it in localStorage.
const TOKEN = /^[a-z0-9-]{8,64}$/i;

// Public: a judge's phone sends its finished ranking. Not permission-gated
// (judges don't sign in), but re-validated against the pool that is actually
// playing right now, never the browser's word for it.
export async function submitSimpleRanking(
  eventId: string,
  judgeToken: string,
  ranking: string[]
): Promise<{ error: string | null }> {
  if (!UUID.test(eventId) || !TOKEN.test(judgeToken)) return { error: 'Invalid request' };

  const playing = await getPlayingSimpleRankingPool(eventId);
  if (!playing) return { error: "This pool isn't playing anymore. Reload to see what's current." };
  if (await isPoolLocked(playing.divisionId, playing.roundNumber, poolId(playing.poolLetter))) {
    return { error: POOL_LOCKED_ERROR };
  }

  const teamIds = playing.teams.map((t) => t.id);
  const seen = new Set(ranking);
  if (seen.size !== ranking.length || ranking.length !== teamIds.length || !teamIds.every((id) => seen.has(id))) {
    return { error: "That ranking doesn't match the current teams. Reload and try again." };
  }

  await saveBallot(eventId, playing.divisionId, playing.roundNumber, playing.poolLetter, judgeToken, ranking);
  return { error: null };
}

// Head Judge only: clears every ranking submitted for a pool (a test run, or a
// phone that needs to start over).
export async function clearSimpleRankings(
  divisionId: string,
  roundNumber: number,
  poolLetter: string
): Promise<{ error: string | null; removed?: number }> {
  await requirePermission('head_judge');
  if (await isPoolLocked(divisionId, roundNumber, poolId(poolLetter))) return { error: POOL_LOCKED_ERROR };
  const removed = await deleteBallots(divisionId, roundNumber, poolLetter);
  return { error: null, removed };
}
