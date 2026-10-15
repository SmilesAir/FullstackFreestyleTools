import 'server-only';
import { activeEventSql } from './active-events-queries';
import { pool } from './db';
import { getPoolJudges, getTeams, type PoolJudgeRow, type TeamRow } from './event-creator-queries';
import { sortPoolTeams } from './event-creator-layout';
import { DEFAULT_TIMECALLS, roundName, type HeadJudgeJudge, type HeadJudgeTeam } from './head-judge';
import type { PoolResultsData } from './head-judge-results';
import type { NoteCategory } from './judging';
import { getOrCreateShortCode } from './pool-shortlink';
import { getPublicPoolResults } from './public-results';

export const ACTIVITY_PAGE_SIZE = 20;

// One pool the player played in or judged.
export type ActivityEntry = {
  eventId: string;
  eventName: string;
  // 'YYYY-MM-DD'
  startDate: string;
  divisionId: string;
  divisionName: string;
  rulesId: string;
  roundNumber: number;
  roundName: string;
  poolId: string;
  letter: string;
  played: boolean;
  // Set when they judged the pool, with their running counts up to and
  // including this pool (oldest judged pool = 1). Test events don't count:
  // both are null for a pool in one.
  judged: { categoryType: string; categoryCount: number | null; overallCount: number | null } | null;
  hasResults: boolean;
  resultsPublished: boolean;
  // Frozen by the Head Judge.
  locked: boolean;
  routineSeconds: number;
  shortCode: string | null;
};

export type ActivityPage = { entries: ActivityEntry[]; page: number; pageCount: number; total: number };

type ActivityRow = {
  event_id: string;
  event_name: string;
  start_date: string;
  division_id: string;
  division_name: string;
  rules_id: string;
  round_number: number;
  pool_id: string;
  played: boolean;
  category_type: string | null;
  category_count: string | null;
  overall_count: string | null;
  has_results: boolean;
  results_published: boolean | null;
  locked: boolean | null;
  routine_seconds: number;
  short_code: string | null;
  total: string;
};

// The player's pools ($1), newest first: by event date, then (within an event)
// pools not played yet, then by when the pool started playing. Pools with
// results but no routines (entered through the Results Parser) have no start
// time, so fall back to round order (later rounds first) after those that do.
// $2/$3 are LIMIT/OFFSET (a NULL limit is no limit). activeOnly keeps only
// active events' pools, filtered last so the running judging counts still
// cover the player's whole history.
const activitySql = (activeOnly: boolean) =>
  `WITH me AS (SELECT id FROM players WHERE id = $1 OR alias_id = $1),
   played AS (
     SELECT DISTINCT t.division_id, t.round_number, t.pool_id
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE tp.player_id IN (SELECT id FROM me) AND t.round_number >= 1
   ),
   judged AS (
     SELECT j.division_id, j.round_number, j.pool_id, min(j.category_type) AS category_type
     FROM pool_judges j
     WHERE j.player_id IN (SELECT id FROM me)
     GROUP BY j.division_id, j.round_number, j.pool_id
   ),
   mine AS (
     SELECT division_id, round_number, pool_id FROM played
     UNION
     SELECT division_id, round_number, pool_id FROM judged
   ),
   info AS (
     SELECT m.division_id, m.round_number, m.pool_id, d.division_name, d.rules_id, d.routine_seconds,
            e.id AS event_id, e.event_name, e.start_date, e.is_test, ${activeEventSql('e')} AS active,
            (pl.division_id IS NOT NULL) AS played, j.category_type,
            (SELECT min(r.started_at) FROM routines r
             WHERE r.division_id = m.division_id AND r.round_number = m.round_number
               AND r.pool_id = m.pool_id AND r.status <> 'cancelled') AS played_at,
            EXISTS (SELECT 1 FROM teams t
                    WHERE t.division_id = m.division_id AND t.round_number = m.round_number
                      AND t.pool_id = m.pool_id AND t.place IS NOT NULL) AS has_results,
            po.results_published, po.locked, po.short_code
     FROM mine m
     JOIN divisions d ON d.id = m.division_id
     JOIN events e ON e.id = d.event_id
     LEFT JOIN played pl ON (pl.division_id, pl.round_number, pl.pool_id) = (m.division_id, m.round_number, m.pool_id)
     LEFT JOIN judged j ON (j.division_id, j.round_number, j.pool_id) = (m.division_id, m.round_number, m.pool_id)
     LEFT JOIN pools po ON (po.division_id, po.round_number, po.pool_id) = (m.division_id, m.round_number, m.pool_id)
   ),
   ranked AS (
     SELECT info.*,
            row_number() OVER (
              ORDER BY start_date DESC, (played_at IS NULL AND NOT has_results) DESC,
                       played_at DESC NULLS LAST, round_number, division_name, pool_id
            ) AS recency
     FROM info
   ),
   counted AS (
     SELECT ranked.*,
            -- Running counts, oldest first (recency 1 is the newest), leaving out test events.
            CASE WHEN category_type IS NOT NULL AND NOT is_test
                 THEN count(*) FILTER (WHERE NOT is_test) OVER (PARTITION BY category_type ORDER BY recency DESC) END AS category_count,
            CASE WHEN category_type IS NOT NULL AND NOT is_test
                 THEN count(category_type) FILTER (WHERE NOT is_test) OVER (ORDER BY recency DESC) END AS overall_count,
            count(*) OVER () AS total
     FROM ranked
   )
   SELECT event_id, event_name, to_char(start_date, 'YYYY-MM-DD') AS start_date, division_id, division_name,
          rules_id, round_number, pool_id, played, category_type, category_count, overall_count,
          has_results, results_published, locked, routine_seconds, short_code, total
   FROM counted
   ${activeOnly ? 'WHERE active' : ''}
   ORDER BY recency
   LIMIT $2 OFFSET $3`;

const toEntry = (r: ActivityRow): ActivityEntry => ({
  eventId: r.event_id,
  eventName: r.event_name,
  startDate: r.start_date,
  divisionId: r.division_id,
  divisionName: r.division_name,
  rulesId: r.rules_id,
  roundNumber: r.round_number,
  roundName: roundName(r.round_number),
  poolId: r.pool_id,
  letter: r.pool_id.replace(/^pool/i, '').toUpperCase(),
  played: r.played,
  judged: r.category_type
    ? {
        categoryType: r.category_type,
        categoryCount: r.category_count === null ? null : Number(r.category_count),
        overallCount: r.overall_count === null ? null : Number(r.overall_count),
      }
    : null,
  hasResults: r.has_results,
  resultsPublished: r.results_published ?? false,
  locked: r.locked ?? false,
  routineSeconds: r.routine_seconds,
  shortCode: r.short_code,
});

export async function getPlayerActivityPage(playerId: string, requestedPage: number): Promise<ActivityPage> {
  const page = Math.max(1, Math.floor(requestedPage) || 1);
  const query = (p: number) =>
    pool.query<ActivityRow>(activitySql(false), [playerId, ACTIVITY_PAGE_SIZE, (p - 1) * ACTIVITY_PAGE_SIZE]);

  let result = await query(page);
  // Past the last page: show the last one instead.
  let shownPage = page;
  if (result.rows.length === 0 && page > 1) {
    const probe = await query(1);
    const total = Number(probe.rows[0]?.total ?? 0);
    shownPage = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
    result = shownPage === 1 ? probe : await query(shownPage);
  }

  const total = Number(result.rows[0]?.total ?? 0);
  return {
    page: shownPage,
    pageCount: Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE)),
    total,
    entries: result.rows.map(toEntry),
  };
}

// The player's pools in active events (a handful at most, so unpaged), in the
// same order and with the same running counts as getPlayerActivityPage.
export async function getActiveEventActivity(playerId: string): Promise<ActivityEntry[]> {
  const result = await pool.query<ActivityRow>(activitySql(true), [playerId, null, 0]);
  return result.rows.map(toEntry);
}

export type ActivityTeam = HeadJudgeTeam & { mine: boolean };

export type ActivityDetail = {
  // Play order.
  teams: ActivityTeam[];
  // Only for a pool they judged and that hasn't been played yet.
  judges: HeadJudgeJudge[] | null;
  // Only for a published Fpa2027 pool: the public page's anonymized summary data.
  summary: {
    teams: HeadJudgeTeam[];
    data: PoolResultsData;
    judgesByCategory: { category: NoteCategory; judges: HeadJudgeJudge[] }[];
  } | null;
  shortCode: string;
  // The player's team, while they can still set its time calls (in a pool with
  // no results that isn't locked, before the team has played).
  timecallTeamId: string | null;
};

// The teams, judges and results behind each entry of a page. Entries often
// share a division, so each division's teams and judges are read once.
export async function getActivityDetails(entries: ActivityEntry[], playerId: string): Promise<ActivityDetail[]> {
  const teamsByDivision = new Map<string, Promise<TeamRow[]>>();
  const judgesByDivision = new Map<string, Promise<PoolJudgeRow[]>>();
  const divisionTeams = (e: ActivityEntry) => {
    let p = teamsByDivision.get(e.divisionId);
    if (!p) teamsByDivision.set(e.divisionId, (p = getTeams(e.divisionId, e.divisionName)));
    return p;
  };
  const divisionJudges = (e: ActivityEntry) => {
    let p = judgesByDivision.get(e.divisionId);
    if (!p) judgesByDivision.set(e.divisionId, (p = getPoolJudges(e.divisionId)));
    return p;
  };

  // Their own player row and its aliases, to mark their team.
  const me = await pool.query<{ id: string }>('SELECT id FROM players WHERE id = $1 OR alias_id = $1', [playerId]);
  const myIds = new Set(me.rows.map((r) => r.id));
  // Teams of theirs (on any pool of the page) that have already played.
  const playedTeams = await pool.query<{ team_id: string }>(
    `SELECT DISTINCT r.team_id::text FROM routines r JOIN team_players tp ON tp.team_id = r.team_id
     WHERE tp.player_id = ANY($1::uuid[]) AND r.status <> 'cancelled'`,
    [[...myIds]]
  );
  const alreadyPlayed = new Set(playedTeams.rows.map((r) => r.team_id));

  return Promise.all(
    entries.map(async (e): Promise<ActivityDetail> => {
      const showJudges = e.judged !== null && !e.hasResults;
      const showSummary = e.hasResults && e.resultsPublished && e.rulesId === 'Fpa2027';
      const [allTeams, allJudges, publicResult, shortCode] = await Promise.all([
        divisionTeams(e),
        showJudges ? divisionJudges(e) : null,
        showSummary ? getPublicPoolResults(e.eventId, e.divisionId, e.roundNumber, e.letter) : null,
        e.shortCode ?? getOrCreateShortCode(e.divisionId, e.roundNumber, e.poolId),
      ]);

      const teams = sortPoolTeams(allTeams.filter((t) => t.round_number === e.roundNumber && t.pool_id === e.poolId)).map(
        (t): ActivityTeam => ({
          id: t.id,
          players: t.players.map((p) => p.name),
          place: t.place,
          timecalls: t.timecalls ?? DEFAULT_TIMECALLS,
          mine: t.players.some((p) => myIds.has(p.id)),
        })
      );
      const judges =
        allJudges
          ?.filter((j) => j.round_number === e.roundNumber && j.pool_id === e.poolId)
          .map((j) => ({ playerId: j.player_id, name: j.name, categoryType: j.category_type })) ?? null;
      const summary =
        publicResult?.data && publicResult.judgesByCategory && publicResult.judgesByCategory.length > 0
          ? { teams: publicResult.teams, data: publicResult.data, judgesByCategory: publicResult.judgesByCategory }
          : null;

      const myTeam = teams.find((t) => t.mine);
      const timecallTeamId =
        myTeam && !e.hasResults && !e.locked && !alreadyPlayed.has(myTeam.id) ? myTeam.id : null;

      return { teams, judges, summary, shortCode, timecallTeamId };
    })
  );
}
