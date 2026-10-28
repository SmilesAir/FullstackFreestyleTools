import "server-only";
import type { Pool } from "pg";
import { pool } from "./db";
import { getMode } from "./db-mode";
import {
  DIVISION_NAMES,
  JUDGE_CATEGORIES,
  POOL_LETTERS,
  ROSTER_ROUND,
  poolId,
  type RulesId,
} from "./event-creator";
import { sortPoolTeams } from "./event-creator-layout";
import {
  getPoolJudges,
  getTeams,
  listDivisions,
} from "./event-creator-queries";
import { getRoutineJudgeCurves } from "./judging-queries";
import { getLockedPoolKeys } from "./pool-locks";
import { getPublishedPoolKeys } from "./pool-publish";
import {
  DEFAULT_TIMECALLS,
  poolKey,
  roundName,
  type HeadJudgeDivision,
  type HeadJudgePool,
} from "./head-judge";
import {
  combineTeamRoutines,
  judgeResultFromNotes,
  type JudgeResult,
  type PoolResultsData,
  type ResultNote,
  type TeamRoutineResult,
} from "./head-judge-results";
import { noteCategoryOf, notePoints, type NoteCategory } from "./judging";
import type { JudgeCurve } from "./judging-curves";
import {
  categorySettings,
  resolveEventSettings,
  scoreLimitOf,
  snapshotCategorySettings,
  type CategorySettings,
} from "./judging-settings";
import { NO_PLAY_STATE, type PlayResponse } from "./head-judge-state";

// A fingerprint of everything the Head Judge screen shows that the Event Creator
// can change: the event (its name and dates, not its judging settings, which the
// Settings tab saves itself), its divisions, teams and their players, its pool
// judges, and the names of the players those refer to. Each row is hashed whole,
// so a change to any column counts, and nothing has to remember to say it
// changed. Empty for an event that doesn't exist. `db` is the database to read
// (default: the active one; the local sync reads Neon's).
export async function getStructureKey(
  eventId: string,
  db: Pick<Pool, "query"> = pool,
): Promise<string> {
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
       (SELECT md5((to_jsonb(e) - 'judging_settings' - 'judge_pin')::text) FROM events e WHERE e.id = $1),
       (SELECT md5(string_agg(md5(to_jsonb(d)::text), ',' ORDER BY d.id)) FROM d),
       (SELECT md5(string_agg(md5(to_jsonb(t)::text), ',' ORDER BY t.id)) FROM t),
       (SELECT md5(string_agg(md5(to_jsonb(tp)::text), ',' ORDER BY tp.id)) FROM tp),
       (SELECT md5(string_agg(md5(to_jsonb(pj)::text), ',' ORDER BY pj.id)) FROM pj),
       (SELECT md5(string_agg(md5(concat_ws(':', pl.id, pl.first_name, pl.last_name, pl.alias_id, pl.country)), ',' ORDER BY pl.id)) FROM pl)
     )) AS key`,
    [eventId],
  );
  return result.rows[0]?.key ?? "";
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
  if (!row.pool_id || row.round_number === null)
    return { state: NO_PLAY_STATE, serverNow, structureKey, presence, mode };
  return {
    state: {
      divisionId: row.division_id,
      roundNumber: row.round_number,
      poolLetter: row.pool_id.replace(/^pool/, ""),
      teamId: row.team_id,
      routineStartedAt:
        row.started_ms === null ? null : Math.round(row.started_ms),
      finishedJudges: row.finished,
      restorableRoutineId: row.restorable,
      judgesReady: row.judges_ready,
      updatedAt: Math.round(row.updated_ms ?? 0),
    },
    serverNow,
    structureKey,
    presence,
    mode,
  };
}

// The Head Judge's playing pool if it is in this division, as a "round:LETTER"
// key like getLockedPoolKeys gives, for the Event Creator's round headings.
export async function getPlayingPoolKey(
  divisionId: string,
): Promise<string | null> {
  const result = await pool.query<{ round_number: number; pool_id: string }>(
    `SELECT round_number, pool_id FROM event_play_state
     WHERE division_id = $1 AND round_number IS NOT NULL AND pool_id IS NOT NULL`,
    [divisionId],
  );
  const row = result.rows[0];
  return row
    ? `${row.round_number}:${row.pool_id.replace(/^pool/i, "").toUpperCase()}`
    : null;
}

// Seconds since each judge's screen last polled the server, by player id, on the
// database's own clock. Nothing (every judge unknown) if it can't be read.
async function readPresence(eventId: string): Promise<Record<string, number>> {
  try {
    const result = await pool.query<{ player_id: string; ago: number }>(
      `SELECT player_id::text, extract(epoch FROM now() - seen_at)::float8 AS ago
       FROM judge_presence WHERE event_id = $1`,
      [eventId],
    );
    return Object.fromEntries(
      result.rows.map((r) => [r.player_id, Math.max(0, Math.round(r.ago))]),
    );
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
    judges_ready: boolean;
    now_ms: number;
  }>(
    `SELECT s.division_id, s.round_number, s.pool_id, s.team_id,
            s.judges_ready_at IS NOT NULL AS judges_ready,
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
    [eventId],
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
export async function getHeadJudgePools(
  eventId: string,
): Promise<HeadJudgeDivision[]> {
  const [listed, testRow] = await Promise.all([
    listDivisions(eventId),
    pool.query<{ is_test: boolean }>(
      "SELECT is_test FROM events WHERE id = $1",
      [eventId],
    ),
  ]);
  const divisions = listed.sort(
    (a, b) => divisionOrder(a.division_name) - divisionOrder(b.division_name),
  );
  const testEvent = testRow.rows[0]?.is_test ?? false;

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

      const roundNumbers = [
        ...new Set(
          teams
            .filter((t) => t.round_number !== ROSTER_ROUND)
            .map((t) => t.round_number),
        ),
      ];
      roundNumbers.sort((a, b) => b - a);

      const rounds = roundNumbers.map((number) => {
        const pools: HeadJudgePool[] = [];
        for (const letter of POOL_LETTERS) {
          const inPool = teams.filter(
            (t) => t.round_number === number && t.pool_id === poolId(letter),
          );
          if (inPool.length === 0) continue;
          pools.push({
            key: poolKey(division.id, number, letter),
            divisionId: division.id,
            divisionName: division.division_name,
            roundNumber: number,
            roundName: roundName(number),
            letter,
            teams: sortPoolTeams(inPool).map((t) => ({
              id: t.id,
              players: t.players.map((p) => p.name),
              place: t.place,
              timecalls: t.timecalls ?? DEFAULT_TIMECALLS,
            })),
            routineSeconds: division.routine_seconds,
            locked: locked.has(`${number}:${letter}`),
            resultsPublished: published.has(`${number}:${letter}`),
            testEvent,
            usesJudges:
              (JUDGE_CATEGORIES[division.rules_id as RulesId] ?? []).length > 0,
            judges: judges
              .filter(
                (j) =>
                  j.round_number === number && j.pool_id === poolId(letter),
              )
              .map((j) => ({
                playerId: j.player_id,
                name: j.name,
                categoryType: j.category_type,
              })),
          });
        }
        return { number, name: roundName(number), pools };
      });

      return {
        id: division.id,
        name: division.division_name,
        rounds: rounds.filter((r) => r.pools.length > 0),
      };
    }),
  );
}

// What each judge noted and scored for each team of a pool: per team, its most
// recent routine that wasn't cancelled, with each judge's note counts and
// submitted score.
export async function getPoolResults(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string,
): Promise<PoolResultsData> {
  const routines = await getPoolRoutines(
    eventId,
    divisionId,
    roundNumber,
    letter,
  );
  const byTeam = new Map<string, TeamRoutineResult[]>();
  for (const r of routines) {
    const judges = Object.fromEntries(
      Object.entries(r.judges).map(([playerId, j]) => [playerId, j.result]),
    );
    byTeam.set(r.teamId, [
      ...(byTeam.get(r.teamId) ?? []),
      { routineId: r.id, judges, judgeCurves: r.judgeCurves },
    ]);
  }
  const data: PoolResultsData = {};
  for (const [teamId, teamRoutines] of byTeam) {
    const combined = combineTeamRoutines(teamRoutines);
    if (combined) data[teamId] = combined;
  }
  return data;
}

// One judge's part of one routine: their notes (in the order taken), the
// settings their result was worked out with, and that result.
export type PoolRoutineJudge = {
  category: NoteCategory;
  notes: ResultNote[];
  settings: CategorySettings | undefined;
  result: JudgeResult;
};

// One run of a team's routine that wasn't cancelled.
export type PoolRoutine = {
  id: string;
  teamId: string;
  startedAt: number;
  routineSeconds: number;
  judges: Record<string, PoolRoutineJudge>;
  judgeCurves: JudgeCurve[];
};

// Every run of each team's routine in a pool that wasn't cancelled, by team and
// then oldest first, with each judge's notes and result: what getPoolResults
// combines, and what the support chat explains results from.
export async function getPoolRoutines(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string,
): Promise<PoolRoutine[]> {
  // Every run of each team's routine that wasn't cancelled, oldest first: judges may score
  // a team one at a time, so the team's result is combined over all of them below.
  const routines = await pool.query<{
    id: string;
    team_id: string;
    started_ms: number;
    routine_seconds: number;
    rules_id: string | null;
    judging_settings: unknown;
  }>(
    `SELECT r.id, r.team_id, extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, e.judging_settings
     FROM routines r
     JOIN events e ON e.id = r.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     WHERE r.event_id = $1 AND r.division_id = $2 AND r.round_number = $3 AND r.pool_id = $4
       AND r.status <> 'cancelled' AND r.team_id IS NOT NULL
     ORDER BY r.team_id, r.started_at`,
    [eventId, divisionId, roundNumber, poolId(letter)],
  );
  if (routines.rows.length === 0) return [];
  const ids = routines.rows.map((r) => r.id);

  const [notes, scores, curves] = await Promise.all([
    pool.query<{
      routine_id: string;
      player_id: string;
      category_type: string;
      note_type: string;
      noted_ms: number;
      line_position: string | null;
      line_value: string | null;
      multiplier: string | null;
    }>(
      `SELECT routine_id, player_id, category_type, note_type,
              extract(epoch FROM noted_at)::float8 * 1000 AS noted_ms, line_position, line_value, multiplier
       FROM fpa2027_judge_notes
       WHERE routine_id = ANY($1::uuid[])
       ORDER BY noted_at, id`,
      [ids],
    ),
    pool.query<{
      routine_id: string;
      judge_player_id: string;
      category_type: string;
      baseline_estimate: string;
      adjust_percent: string;
      score: string;
      settings: unknown;
    }>(
      `SELECT routine_id, judge_player_id, category_type, baseline_estimate, adjust_percent, score, settings
       FROM fpa2027_judge_scores WHERE routine_id = ANY($1::uuid[])`,
      [ids],
    ),
    getRoutineJudgeCurves(ids),
  ]);

  // Each judge's notes and score per routine, then their result from them: the
  // limit of positive notes from the settings the score was made with, or the
  // event's current ones if there is no score yet.
  const num = (v: string | null) => (v === null ? null : Number(v));
  const key = (routineId: string, playerId: string, category: string) =>
    `${routineId}:${playerId}:${category}`;
  const notesByJudge = new Map<string, ResultNote[]>();
  for (const n of notes.rows) {
    const k = key(n.routine_id, n.player_id, n.category_type);
    const list = notesByJudge.get(k) ?? [];
    list.push({
      noteType: n.note_type,
      notedAt: n.noted_ms,
      linePosition: num(n.line_position),
      lineValue: num(n.line_value),
      multiplier: num(n.multiplier),
    });
    notesByJudge.set(k, list);
  }
  const scoreByJudge = new Map(
    scores.rows.map((s) => [
      key(s.routine_id, s.judge_player_id, s.category_type),
      s,
    ]),
  );

  return routines.rows.map((r) => {
    const entry: PoolRoutine = {
      id: r.id,
      teamId: r.team_id,
      startedAt: r.started_ms,
      routineSeconds: r.routine_seconds,
      judges: {},
      judgeCurves: curves[r.id] ?? [],
    };
    const eventSettings = resolveEventSettings(
      r.rules_id ?? "Fpa2020",
      r.judging_settings,
    );
    const prefix = `${r.id}:`;
    const judgeKeys = new Set(
      [...notesByJudge.keys(), ...scoreByJudge.keys()].filter((k) =>
        k.startsWith(prefix),
      ),
    );
    for (const k of judgeKeys) {
      const [, playerId, category] = k.split(":");
      const noteCategory = noteCategoryOf(category);
      if (!noteCategory) continue;
      const s = scoreByJudge.get(k);
      const current = categorySettings(eventSettings, category);
      const snapshot = s
        ? snapshotCategorySettings(s.settings, category, scoreLimitOf(current))
        : null;
      const settings = snapshot !== null ? snapshot : current;
      const judgeNotes = notesByJudge.get(k) ?? [];
      entry.judges[playerId] = {
        category: noteCategory,
        notes: judgeNotes,
        settings,
        result: judgeResultFromNotes(
          judgeNotes,
          { startedAt: r.started_ms, routineSeconds: r.routine_seconds },
          settings,
          noteCategory,
          s
            ? {
                score: Number(s.score),
                baseline: Number(s.baseline_estimate),
                adjustPercent: Number(s.adjust_percent),
              }
            : null,
        ),
      };
    }
    return entry;
  });
}

// One judge's note on the running routine, for the Adjust Start tool: who took
// it, when it was really tapped (ms, server clock) and what it is worth.
export type RoutineStartNote = {
  id: string;
  judge: string;
  category: string;
  noteType: string;
  notedAt: number;
  points: number;
};

// The running routine's start and every judge's notes on it (those tapped
// before the start too, which don't count), for the Adjust Start tool.
// `routineId` is null when no routine is running. `submitted` is how many
// scores are already in (moving the start works them out again).
export type RoutineStartData = {
  routineId: string | null;
  startedAt: number | null;
  routineSeconds: number;
  serverNow: number;
  submitted: number;
  notes: RoutineStartNote[];
};

export async function getRoutineStartData(
  eventId: string,
): Promise<RoutineStartData> {
  const routine = await pool.query<{
    routine_id: string | null;
    started_ms: number | null;
    routine_seconds: number;
    rules_id: string | null;
    judging_settings: unknown;
    submitted: number;
    now_ms: number;
  }>(
    `SELECT s.routine_id, extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, e.judging_settings,
            (SELECT count(*)::int FROM fpa2027_judge_scores sc WHERE sc.routine_id = s.routine_id) AS submitted,
            extract(epoch FROM now())::float8 * 1000 AS now_ms
     FROM (SELECT 1) one
     LEFT JOIN event_play_state s ON s.event_id = $1 AND s.routine_started_at IS NOT NULL
     LEFT JOIN events e ON e.id = s.event_id
     LEFT JOIN divisions d ON d.id = s.division_id`,
    [eventId],
  );
  const r = routine.rows[0];
  const serverNow = Math.round(r.now_ms);
  if (!r.routine_id || r.started_ms === null) {
    return {
      routineId: null,
      startedAt: null,
      routineSeconds: 180,
      serverNow,
      submitted: 0,
      notes: [],
    };
  }

  const notes = await pool.query<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    category_type: string;
    note_type: string;
    noted_ms: number;
    line_value: string | null;
    multiplier: string | null;
  }>(
    `SELECT n.id, p.first_name, p.last_name, n.category_type, n.note_type,
            extract(epoch FROM n.noted_at)::float8 * 1000 AS noted_ms, n.line_value, n.multiplier
     FROM fpa2027_judge_notes n
     LEFT JOIN players p ON p.id = n.player_id
     WHERE n.routine_id = $1
     ORDER BY n.noted_at, n.id`,
    [r.routine_id],
  );
  const settings = resolveEventSettings(
    r.rules_id ?? "Fpa2020",
    r.judging_settings,
  );
  return {
    routineId: r.routine_id,
    startedAt: Math.round(r.started_ms),
    routineSeconds: r.routine_seconds,
    serverNow,
    submitted: r.submitted,
    notes: notes.rows.map((n) => ({
      id: n.id,
      judge: [n.first_name, n.last_name].filter(Boolean).join(" ") || "Judge",
      category: n.category_type,
      noteType: n.note_type,
      notedAt: Math.round(n.noted_ms),
      points: notePoints(
        {
          noteType: n.note_type,
          lineValue: n.line_value === null ? null : Number(n.line_value),
          multiplier: n.multiplier === null ? null : Number(n.multiplier),
        },
        categorySettings(settings, n.category_type)?.noteWeights ?? {},
      ),
    })),
  };
}
