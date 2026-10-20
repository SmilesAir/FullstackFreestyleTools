import 'server-only';
import { pool } from './db';
import type { HeadJudgeDivision } from './head-judge';
import { getHeadJudgePools } from './head-judge-queries';
import type { getCurrentUserAccess } from './authz';

type Access = NonNullable<Awaited<ReturnType<typeof getCurrentUserAccess>>>;

// Which pools someone may review. Admins and the pool_review permission see
// every division; otherwise it comes from who they are: an event's committee
// sees all its divisions, a division's directors see that division.
export type PoolReviewScope =
  | { all: true }
  | { all: false; committeeEventIds: Set<string>; directorDivisionIds: Set<string> };

// The events Pool Review covers: not hidden and not over yet.
const coveredEventSql = (alias: string) => `(NOT ${alias}.is_hidden AND ${alias}.end_date >= current_date)`;

export async function getPoolReviewScope(access: Access): Promise<PoolReviewScope> {
  if (access.isAdmin || access.permissions.has('pool_review')) return { all: true };
  const none: PoolReviewScope = { all: false, committeeEventIds: new Set(), directorDivisionIds: new Set() };

  const linked = await pool.query<{ player_id: string | null }>('SELECT player_id FROM users WHERE id = $1', [access.userId]);
  const playerId = linked.rows[0]?.player_id;
  if (!playerId) return none;

  // The linked player and its aliases.
  const me = 'ARRAY(SELECT id FROM players WHERE id = $1 OR alias_id = $1)';
  const [committee, directors] = await Promise.all([
    pool.query<{ id: string }>(
      `SELECT e.id FROM events e WHERE ${coveredEventSql('e')} AND e.committee_player_ids && ${me}`,
      [playerId]
    ),
    pool.query<{ id: string }>(
      `SELECT d.id FROM divisions d JOIN events e ON e.id = d.event_id
       WHERE ${coveredEventSql('e')} AND d.director_player_ids && ${me}`,
      [playerId]
    ),
  ]);
  return {
    all: false,
    committeeEventIds: new Set(committee.rows.map((r) => r.id)),
    directorDivisionIds: new Set(directors.rows.map((r) => r.id)),
  };
}

export const hasPoolReviewAccess = (scope: PoolReviewScope) =>
  scope.all || scope.committeeEventIds.size > 0 || scope.directorDivisionIds.size > 0;

export type ReviewEvent = { id: string; name: string; startDate: string; endDate: string; isTest: boolean };

// The covered events the scope reaches, soonest first.
export async function listReviewEvents(scope: PoolReviewScope): Promise<ReviewEvent[]> {
  if (!hasPoolReviewAccess(scope)) return [];
  const result = await pool.query<{ id: string; event_name: string; start_date: string; end_date: string; is_test: boolean }>(
    `SELECT e.id, e.event_name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(e.end_date, 'YYYY-MM-DD') AS end_date, e.is_test
     FROM events e
     WHERE ${coveredEventSql('e')}
       AND ($1::boolean OR e.id = ANY($2::uuid[])
            OR EXISTS (SELECT 1 FROM divisions d WHERE d.event_id = e.id AND d.id = ANY($3::uuid[])))
     ORDER BY e.start_date, e.event_name`,
    scope.all
      ? [true, [], []]
      : [false, [...scope.committeeEventIds], [...scope.directorDivisionIds]]
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.event_name,
    startDate: r.start_date,
    endDate: r.end_date,
    isTest: r.is_test,
  }));
}

// The event's pools the scope may review that aren't published yet, laid out
// like the Head Judge's (divisions, then rounds in playing order, pools A to D,
// teams in play order). Empty rounds and divisions are left out.
export async function getReviewPools(eventId: string, scope: PoolReviewScope): Promise<HeadJudgeDivision[]> {
  const wholeEvent = scope.all || scope.committeeEventIds.has(eventId);
  const divisions = await getHeadJudgePools(eventId);
  return divisions
    .filter((d) => wholeEvent || (!scope.all && scope.directorDivisionIds.has(d.id)))
    .map((d) => ({
      ...d,
      rounds: d.rounds
        .map((r) => ({ ...r, pools: r.pools.filter((p) => !p.resultsPublished) }))
        .filter((r) => r.pools.length > 0),
    }))
    .filter((d) => d.rounds.length > 0);
}
