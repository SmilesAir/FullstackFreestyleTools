import 'server-only';
import type { Pool } from 'pg';
import { pool } from './db';
import { getMode } from './db-mode';
import { DIVISION_NAMES, JUDGE_CATEGORIES, POOL_LETTERS, ROSTER_ROUND, poolId, type RulesId } from './event-creator';
import { sortPoolTeams } from './event-creator-layout';
import { getPoolJudges, getTeams, listDivisions } from './event-creator-queries';
import { getRoutineCurves } from './judging-queries';
import { getLockedPoolKeys } from './pool-locks';
import { getPublishedPoolKeys } from './pool-publish';
import { poolKey, roundName, type HeadJudgeDivision, type HeadJudgePool } from './head-judge';
import { combineTeamRoutines, type PoolResultsData, type TeamResult } from './head-judge-results';
import { NO_PLAY_STATE, type PlayResponse } from './head-judge-state';

// A fingerprint of everything the Head Judge screen shows that the Event Creator
// can change: the event (its name and dates, not its judging settings, which the
// Settings tab saves itself), its divisions, teams and their players, its pool
// judges, and the names of the players those refer to. Each row is hashed whole,
// so a change to any column counts, and nothing has to remember to say it
// changed. Empty for an event that doesn't exist. `db` is the database to read
// (default: the active one; the local sync reads Neon's).
export async function getStructureKey(eventId: string, db: Pick<Pool, 'query'> = pool): Promise<string> {
  const result = await db.query<{ key: string | null }>(
    `WITH d AS (SELECT * FROM divisions WHERE event_id = $1),
          t AS (SELECT t.* FROM teams t JOIN d ON d.id = t.division_id),
          tp AS (SELECT tp.* FROM team_players tp JOIN t ON t.id = tp.team_id),
          pj AS (SELECT pj.* FROM pool_judges pj JOIN d ON d.id = pj.division_id),
          ref AS (SELECT player_id FROM tp UNION SELECT player_id FROM pj),
          pl AS (
            SELECT p.* FROM players p
            WHERE p.id IN (SELECT player_id FROM ref)
               OR p.id IN (SELECT a.alias_id FROM players a WHERE a.id IN (SELECT player_id FROM ref) AND a.alias_id IS NOT NULL)
          )
     SELECT md5(concat_ws('|',
       (SELECT md5((to_jsonb(e) - 'judging_settings')::text) FROM events e WHERE e.id = $1),
       (SELECT md5(string_agg(md5(to_jsonb(d)::text), ',' ORDER BY d.id)) FROM d),
       (SELECT md5(string_agg(md5(to_jsonb(t)::text), ',' ORDER BY t.id)) FROM t),
       (SELECT md5(string_agg(md5(to_jsonb(tp)::text), ',' ORDER BY tp.id)) FROM tp),
       (SELECT md5(string_agg(md5(to_jsonb(pj)::text), ',' ORDER BY pj.id)) FROM pj),
       (SELECT md5(string_agg(md5(concat_ws(':', pl.id, pl.first_name, pl.last_name, pl.alias_id, pl.country)), ',' ORDER BY pl.id)) FROM pl)
     )) AS key`,
    [eventId]
  );
  return result.rows[0]?.key ?? '';
}

// The event's live play state, with the database's clock read in the same query
// (every screen measures its clock against this one, so timers agree), the
// structure fingerprint, which judges' screens have been heard from lately, and
// which database is answering (the screens poll faster from the local one).
export async function getPlayState(eventId: string): Promise<PlayResponse> {
  const [structureKey, playRows, presence] = await Promise.all([
    getStructureKey(eventId),
    readPlayRow(eventId),
    readPresence(eventId),
  ]);
  const mode = getMode();
  const row = playRows.rows[0];
  const serverNow = Math.round(row.now_ms);
  // Only a row for a pool that still exists counts as a playing pool.
  if (!row.pool_id || row.round_number === null) return { state: NO_PLAY_STATE, serverNow, structureKey, presence, mode };
  return {
    state: {
      divisionId: row.division_id,
      roundNumber: row.round_number,
      poolLetter: row.pool_id.replace(/^pool/, ''),
      teamId: row.team_id,
      routineStartedAt: row.started_ms === null ? null : Math.round(row.started_ms),
      finishedJudges: row.finished,
      restorableRoutineId: row.restorable,
      updatedAt: Math.round(row.updated_ms ?? 0),
    },
    serverNow,
    structureKey,
    presence,
    mode,
  };
}

// Seconds since each judge's screen last polled the server, by player id, on the
// database's own clock. Nothing (every judge unknown) if it can't be read.
async function readPresence(eventId: string): Promise<Record<string, number>> {
  try {
    const result = await pool.query<{ player_id: string; ago: number }>(
      `SELECT player_id::text, extract(epoch FROM now() - seen_at)::float8 AS ago
       FROM judge_presence WHERE event_id = $1`,
      [eventId]
    );
    return Object.fromEntries(result.rows.map((r) => [r.player_id, Math.max(0, Math.round(r.ago))]));
  } catch {
    return {};
  }
}

function readPlayRow(eventId: string) {
  return pool.query<{
    division_id: string | null;
    round_number: number | null;
    pool_id: string | null;
    team_id: string | null;
    started_ms: number | null;
    updated_ms: number | null;
    finished: string[];
    restorable: string | null;
    now_ms: number;
  }>(
    `SELECT s.division_id, s.round_number, s.pool_id, s.team_id,
            extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms,
            extract(epoch FROM s.updated_at)::float8 * 1000 AS updated_ms,
            COALESCE((SELECT array_agg(sc.judge_player_id::text ORDER BY sc.judge_player_id)
                      FROM fpa2027_judge_scores sc
                      WHERE sc.routine_id = s.routine_id AND s.routine_started_at IS NOT NULL), '{}'::text[]) AS finished,
            CASE WHEN last.status = 'cancelled'
                  AND (EXISTS (SELECT 1 FROM fpa2027_judge_notes n WHERE n.routine_id = last.id)
                       OR EXISTS (SELECT 1 FROM fpa2027_judge_scores sc WHERE sc.routine_id = last.id))
                 THEN last.id::text END AS restorable,
            extract(epoch FROM now())::float8 * 1000 AS now_ms
     FROM (SELECT 1) one
     LEFT JOIN event_play_state s ON s.event_id = $1
     -- The playing team's latest routine in this pool, while none is running.
     LEFT JOIN LATERAL (
       SELECT r.id, r.status FROM routines r
       WHERE s.routine_started_at IS NULL AND r.event_id = s.event_id AND r.division_id = s.division_id
         AND r.round_number = s.round_number AND r.pool_id = s.pool_id AND r.team_id = s.team_id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) last ON true`,
    [eventId]
  );
}

const divisionOrder = (name: string) => {
  const i = DIVISION_NAMES.indexOf(name as (typeof DIVISION_NAMES)[number]);
  return i === -1 ? DIVISION_NAMES.length : i;
};

// Every pool that has teams in the event, grouped by division and then round.
// Divisions come in the standard order, rounds in playing order (the earliest
// round, with the highest number, first and the Finals last), pools A to D,
// teams in play order.
export async function getHeadJudgePools(eventId: string): Promise<HeadJudgeDivision[]> {
  const divisions = (await listDivisions(eventId)).sort(
    (a, b) => divisionOrder(a.division_name) - divisionOrder(b.division_name)
  );

  return Promise.all(
    divisions.map(async (division): Promise<HeadJudgeDivision> => {
      const [teams, judges, lockedKeys, publishedKeys] = await Promise.all([
        getTeams(division.id, division.division_name),
        getPoolJudges(division.id),
        getLockedPoolKeys(division.id),
        getPublishedPoolKeys(division.id),
      ]);
      const locked = new Set(lockedKeys);
      const published = new Set(publishedKeys);

      const roundNumbers = [...new Set(teams.filter((t) => t.round_number !== ROSTER_ROUND).map((t) => t.round_number))];
      roundNumbers.sort((a, b) => b - a);

      const rounds = roundNumbers.map((number) => {
        const pools: HeadJudgePool[] = [];
        for (const letter of POOL_LETTERS) {
          const inPool = teams.filter((t) => t.round_number === number && t.pool_id === poolId(letter));
          if (inPool.length === 0) continue;
          pools.push({
            key: poolKey(division.id, number, letter),
            divisionId: division.id,
            divisionName: division.division_name,
            roundNumber: number,
            roundName: roundName(number),
            letter,
            teams: sortPoolTeams(inPool).map((t) => ({ id: t.id, players: t.players.map((p) => p.name), place: t.place })),
            routineSeconds: division.routine_seconds,
            locked: locked.has(`${number}:${letter}`),
            resultsPublished: published.has(`${number}:${letter}`),
            usesJudges: (JUDGE_CATEGORIES[division.rules_id as RulesId] ?? []).length > 0,
            judges: judges
              .filter((j) => j.round_number === number && j.pool_id === poolId(letter))
              .map((j) => ({ playerId: j.player_id, name: j.name, categoryType: j.category_type })),
          });
        }
        return { number, name: roundName(number), pools };
      });

      return { id: division.id, name: division.division_name, rounds: rounds.filter((r) => r.pools.length > 0) };
    })
  );
}

// What each judge noted and scored for each team of a pool: per team, its most
// recent routine that wasn't cancelled, with each judge's note counts and
// submitted score.
export async function getPoolResults(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string
): Promise<PoolResultsData> {
  // Every run of each team's routine that wasn't cancelled, oldest first: judges may score
  // a team one at a time, so the team's result is combined over all of them below.
  const routines = await pool.query<{ id: string; team_id: string }>(
    `SELECT r.id, r.team_id
     FROM routines r
     WHERE r.event_id = $1 AND r.division_id = $2 AND r.round_number = $3 AND r.pool_id = $4
       AND r.status <> 'cancelled' AND r.team_id IS NOT NULL
     ORDER BY r.team_id, r.started_at`,
    [eventId, divisionId, roundNumber, poolId(letter)]
  );
  if (routines.rows.length === 0) return {};
  const ids = routines.rows.map((r) => r.id);

  const [counts, scores, moves, curves] = await Promise.all([
    pool.query<{ routine_id: string; judge_player_id: string; note_type: string; n: string; points: string }>(
      `SELECT routine_id, judge_player_id, note_type, n, points
       FROM fpa2027_judge_note_counts WHERE routine_id = ANY($1::uuid[])`,
      [ids]
    ),
    pool.query<{
      routine_id: string;
      judge_player_id: string;
      baseline_estimate: string;
      adjust_percent: string;
      score: string;
    }>(
      `SELECT routine_id, judge_player_id, baseline_estimate, adjust_percent, score
       FROM fpa2027_judge_scores WHERE routine_id = ANY($1::uuid[])`,
      [ids]
    ),
    pool.query<{ routine_id: string; player_id: string; note_type: string; line_position: string }>(
      `SELECT routine_id, player_id, note_type, line_position
       FROM fpa2027_judge_notes
       WHERE routine_id = ANY($1::uuid[]) AND category_type = 'Diff' AND line_position IS NOT NULL
       ORDER BY noted_at, id`,
      [ids]
    ),
    getRoutineCurves(ids),
  ]);

  // Each routine's own result first (team id -> its routines, oldest first).
  const byTeam = new Map<string, TeamResult[]>();
  const byRoutine = new Map<string, TeamResult>();
  for (const r of routines.rows) {
    const entry: TeamResult = { routineId: r.id, judges: {}, curves: curves[r.id] ?? [] };
    byTeam.set(r.team_id, [...(byTeam.get(r.team_id) ?? []), entry]);
    byRoutine.set(r.id, entry);
  }
  const judge = (routineId: string, playerId: string) => {
    const entry = byRoutine.get(routineId)!;
    return (entry.judges[playerId] ??= { counts: {}, points: 0, moves: [], submitted: null });
  };
  for (const c of counts.rows) {
    const j = judge(c.routine_id, c.judge_player_id);
    j.counts[c.note_type] = Number(c.n);
    j.points += Number(c.points);
  }
  for (const m of moves.rows) {
    judge(m.routine_id, m.player_id).moves.push({ position: Number(m.line_position), rating: m.note_type });
  }
  for (const s of scores.rows) {
    judge(s.routine_id, s.judge_player_id).submitted = {
      score: Number(s.score),
      baseline: Number(s.baseline_estimate),
      adjustPercent: Number(s.adjust_percent),
    };
  }

  const data: PoolResultsData = {};
  for (const [teamId, teamRoutines] of byTeam) {
    const combined = combineTeamRoutines(teamRoutines);
    if (combined) data[teamId] = combined;
  }
  return data;
}
