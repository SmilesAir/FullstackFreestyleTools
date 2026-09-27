import 'server-only';
import { pool } from './db';
import { getMode } from './db-mode';
import { roundName } from './head-judge';
import { categorySettings, resolveEventSettings, resolveSettings } from './judging-settings';
import { CURVE_SHAPE, CURVE_SPREAD, scoreCurve, type CurveScore } from './score-curve';
import {
  JUDGING_CATEGORIES,
  JUDGING_RULES_ID,
  NOTE_CATEGORIES,
  categoryByType,
  notePoints,
  type JudgedRoutine,
  type OtherCurve,
  type JudgeHistory,
  type JudgeNote,
  type JudgeState,
  type JudgingCategory,
  type JudgingEvent,
  type SeatHolder,
  type SubmittedScore,
  type UpcomingTeam,
} from './judging';
import { sortPoolTeams } from './event-creator-layout';
import { getTeams } from './event-creator-queries';

// These are public on purpose: judges reach them without logging in, so nothing
// here checks a permission and nothing beyond a judge's name is returned.
//
// Only pools of divisions whose Rules are the Fpa2027 judging system take part.

// A division's rules default (see divisions.rules_id).
const DEFAULT_RULES_ID = 'Fpa2020';

// For a category that has no notes, so no estimate of its own.
const DEFAULT_ESTIMATE = { areaScale: 1, power: 1 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = JUDGING_CATEGORIES.map((c) => c.type);

type Row = { event_id: string; event_name: string; player_id: string; first_name: string; last_name: string; category_type: string };

// The order that numbers a category's judges into seats (see seatPath). The id
// settles two judges with the same name.
const SEAT_ORDER = 'p.last_name, p.first_name, p.id';

// Who holds a seat now: the `seat`-th judge (from 1) of this category in the
// event's playing pool, or null if the pool has fewer (or nothing is playing).
export async function getSeatHolder(eventId: string, categoryType: string, seat: number): Promise<SeatHolder> {
  if (!UUID.test(eventId) || !Number.isInteger(seat) || seat < 1) return null;
  const result = await pool.query<{ player_id: string; first_name: string; last_name: string }>(
    `SELECT p.id AS player_id, p.first_name, p.last_name
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN divisions d ON d.id = s.division_id AND d.rules_id = $3
     JOIN pool_judges j ON j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
     JOIN players p ON p.id = j.player_id
     WHERE e.id = $1 AND e.is_playing AND j.category_type = $2
     ORDER BY ${SEAT_ORDER}
     OFFSET $4 LIMIT 1`,
    [eventId, categoryType, JUDGING_RULES_ID, seat - 1]
  );
  const row = result.rows[0];
  return row ? { playerId: row.player_id, name: `${row.first_name} ${row.last_name}` } : null;
}

// Judges of the pool that is playing, for each event that is turned on. An event
// with no playing pool, or a playing pool without judges, isn't returned unless
// it also has a Simple Ranking division (simpleRanking below).
export async function getJudgingEvents(): Promise<JudgingEvent[]> {
  const [result, simpleRankingEvents] = await Promise.all([
    pool.query<Row>(
      `SELECT e.id AS event_id, e.event_name, p.id AS player_id, p.first_name, p.last_name, j.category_type
       FROM events e
       JOIN event_play_state s ON s.event_id = e.id
       JOIN divisions d ON d.id = s.division_id AND d.rules_id = $2
       JOIN pool_judges j ON j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
       JOIN players p ON p.id = j.player_id
       WHERE e.is_playing AND j.category_type = ANY($1)
       ORDER BY e.start_date DESC, e.event_name, ${SEAT_ORDER}`,
      [TYPES, JUDGING_RULES_ID]
    ),
    getSimpleRankingEventIds(),
  ]);

  const events = new Map<string, JudgingEvent>();
  for (const r of result.rows) {
    const category = categoryByType(r.category_type);
    if (!category) continue;
    let event = events.get(r.event_id);
    if (!event) events.set(r.event_id, (event = { eventId: r.event_id, eventName: r.event_name, judges: [], simpleRanking: false }));
    // Rows come in seat order, so a judge's seat is one more than the judges
    // of their category already listed.
    const seat = event.judges.filter((j) => j.category === category).length + 1;
    event.judges.push({ playerId: r.player_id, name: `${r.first_name} ${r.last_name}`, category, seat });
  }

  const order = (c: JudgingCategory) => JUDGING_CATEGORIES.indexOf(c);
  for (const event of events.values()) {
    // Stable sort: names stay in the query's order within a category.
    event.judges.sort((a, b) => order(a.category) - order(b.category));
  }

  for (const r of simpleRankingEvents) {
    const event = events.get(r.event_id);
    if (event) event.simpleRanking = true;
    else events.set(r.event_id, { eventId: r.event_id, eventName: r.event_name, judges: [], simpleRanking: true });
  }
  return [...events.values()].sort((a, b) => a.eventName.localeCompare(b.eventName));
}

// Events that are turned on and have a Simple Ranking division (whether or not
// its pool is the one playing right now — the judge screen itself says when
// there's nothing to rank).
async function getSimpleRankingEventIds(): Promise<{ event_id: string; event_name: string }[]> {
  const result = await pool.query<{ event_id: string; event_name: string }>(
    `SELECT DISTINCT e.id AS event_id, e.event_name
     FROM events e JOIN divisions d ON d.event_id = e.id
     WHERE e.is_playing AND d.rules_id = 'SimpleRanking'`
  );
  return result.rows;
}

// "First / First" for a team's players (first names only, on the judge screens).
const teamNameSql = (teamId: string) =>
  `(SELECT string_agg(p.first_name, ' / ' ORDER BY p.last_name, p.first_name)
    FROM team_players tp JOIN players p ON p.id = tp.player_id WHERE tp.team_id = ${teamId})`;

// The same for the players fixed on a routine when it started.
const routineNameSql = (routineId: string) =>
  `(SELECT string_agg(p.first_name, ' / ' ORDER BY p.last_name, p.first_name)
    FROM routine_players rp JOIN players p ON p.id = rp.player_id WHERE rp.routine_id = ${routineId})`;

// A saved note as a judge's screen wants it. numeric columns arrive as text.
type NoteRow = {
  id: string;
  note_type: string;
  noted_ms: number;
  line_position: string | null;
  line_value: string | null;
  multiplier: string | null;
};
const NOTE_COLUMNS = `n.id, n.note_type, extract(epoch FROM n.noted_at)::float8 * 1000 AS noted_ms,
                      n.line_position, n.line_value, n.multiplier`;
const toNote = (r: NoteRow): JudgeNote => ({
  id: r.id,
  noteType: r.note_type,
  notedAt: Math.round(r.noted_ms),
  ...(r.line_value !== null && r.multiplier !== null
    ? { linePosition: Number(r.line_position), lineValue: Number(r.line_value), multiplier: Number(r.multiplier) }
    : {}),
});

// Everything a judge's screen shows while it polls: whether they are judging
// now, what is playing, the routine's start, and their own notes and submitted
// score for the running routine (or, when none is running, for their most
// recent one that wasn't cancelled).
export async function getJudgeState(eventId: string, playerId: string, categoryType: string): Promise<JudgeState> {
  const state = await pool.query<{
    round_number: number | null;
    pool_id: string | null;
    division_name: string | null;
    routine_seconds: number | null;
    rules_id: string | null;
    judging_settings: unknown;
    team_name: string | null;
    routine_id: string | null;
    started_ms: number | null;
    judging: boolean;
    now_ms: number;
  }>(
    `SELECT s.round_number, s.pool_id, d.division_name, d.routine_seconds, d.rules_id, e.judging_settings,
            COALESCE(${routineNameSql('s.routine_id')}, ${teamNameSql('s.team_id')}) AS team_name,
            s.routine_id,
            extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms,
            COALESCE(e.is_playing AND d.rules_id = $4 AND EXISTS (
              SELECT 1 FROM pool_judges j
              WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                AND j.player_id = $2 AND j.category_type = $3), false) AS judging,
            extract(epoch FROM now())::float8 * 1000 AS now_ms
     FROM (SELECT 1) one
     LEFT JOIN events e ON e.id = $1
     LEFT JOIN event_play_state s ON s.event_id = e.id
     LEFT JOIN divisions d ON d.id = s.division_id`,
    [eventId, playerId, categoryType, JUDGING_RULES_ID]
  );
  const row = state.rows[0];
  const running = row.routine_id !== null && row.started_ms !== null;
  const startedAt = running ? Math.round(row.started_ms!) : null;
  const routineSeconds = row.routine_seconds ?? 180;

  let notesRoutine: JudgeState['notesRoutine'] = null;
  // The judging system of the routine the notes belong to.
  let rulesId = row.rules_id;
  if (running && startedAt !== null) {
    notesRoutine = { id: row.routine_id!, startedAt, teamName: row.team_name, routineSeconds };
  } else {
    const latest = await pool.query<{
      id: string;
      started_ms: number;
      routine_seconds: number;
      rules_id: string | null;
      team_name: string | null;
    }>(
      `SELECT r.id, extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
              COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id,
              ${routineNameSql('r.id')} AS team_name
       FROM routines r
       LEFT JOIN divisions d ON d.id = r.division_id
       WHERE r.event_id = $1 AND r.status <> 'cancelled'
         AND (EXISTS (SELECT 1 FROM fpa2027_judge_notes n
                      WHERE n.routine_id = r.id AND n.player_id = $2 AND n.category_type = $3)
              OR EXISTS (SELECT 1 FROM fpa2027_judge_scores sc
                         WHERE sc.routine_id = r.id AND sc.judge_player_id = $2 AND sc.category_type = $3))
       ORDER BY r.started_at DESC
       LIMIT 1`,
      [eventId, playerId, categoryType]
    );
    const r = latest.rows[0];
    if (r) {
      notesRoutine = {
        id: r.id,
        startedAt: Math.round(r.started_ms),
        teamName: r.team_name,
        routineSeconds: r.routine_seconds,
      };
      rulesId = r.rules_id;
    }
  }
  // The judge's own category's tunables (a category without notes has none).
  const own = categorySettings(resolveEventSettings(rulesId ?? DEFAULT_RULES_ID, row.judging_settings), categoryType);
  const noteWeights: Record<string, number> = own?.noteWeights ?? {};
  const estimate = own?.estimate ?? DEFAULT_ESTIMATE;

  let notes: JudgeNote[] = [];
  let submitted: SubmittedScore | null = null;
  if (notesRoutine) {
    const [found, scored] = await Promise.all([
      pool.query<NoteRow>(
        `SELECT ${NOTE_COLUMNS}
         FROM fpa2027_judge_notes n
         WHERE n.routine_id = $1 AND n.player_id = $2 AND n.category_type = $3
         ORDER BY n.noted_at, n.id`,
        [notesRoutine.id, playerId, categoryType]
      ),
      pool.query<{ score: string; baseline_estimate: string; adjust_percent: string }>(
        `SELECT score, baseline_estimate, adjust_percent FROM fpa2027_judge_scores
         WHERE routine_id = $1 AND judge_player_id = $2 AND category_type = $3`,
        [notesRoutine.id, playerId, categoryType]
      ),
    ]);
    notes = found.rows.map(toNote);
    const s = scored.rows[0];
    if (s) submitted = { score: Number(s.score), baseline: Number(s.baseline_estimate), adjustPercent: Number(s.adjust_percent) };
  }

  const letter = row.pool_id?.replace(/^pool/, '') ?? null;
  return {
    serverNow: Math.round(row.now_ms),
    judging: row.judging,
    poolTitle:
      row.division_name && row.round_number !== null && letter
        ? `${row.division_name} · ${roundName(row.round_number)} · Pool ${letter}`
        : null,
    teamName: row.team_name,
    routineStartedAt: startedAt,
    routineId: running ? row.routine_id : null,
    routineSeconds,
    notesRoutine,
    submitted,
    notes,
    noteWeights,
    estimate,
    line: own?.line ?? null,
    mode: getMode(),
  };
}

// The Review tab's list: every routine in the event (not cancelled) this judge
// took notes on or scored in this category, and every routine of the pool they
// are judging now (notes or not), in the order they were played, with their
// notes and score; then that pool's teams that haven't played yet.
export async function getJudgeHistory(eventId: string, playerId: string, categoryType: string): Promise<JudgeHistory> {
  const judging = await getJudgingPool(eventId, playerId, categoryType);
  const [routines, upcoming] = await Promise.all([
    getJudgedRoutines(eventId, playerId, categoryType, judging),
    judging ? getUpcomingTeams(eventId, judging) : [],
  ]);
  const others = await getOtherJudgeCurves(
    eventId,
    playerId,
    categoryType,
    routines.map((r) => r.id)
  );
  return { routines: routines.map((r) => ({ ...r, others: others[r.id] ?? [] })), upcoming };
}

type JudgingPool = {
  division_id: string;
  division_name: string;
  round_number: number;
  pool_id: string;
  routine_seconds: number;
};

const poolTitleOf = (divisionName: string, roundNumber: number, poolId: string) =>
  `${divisionName} · ${roundName(roundNumber)} · Pool ${poolId.replace(/^pool/, '')}`;

// The playing pool, if this judge is judging this category in it right now.
async function getJudgingPool(eventId: string, playerId: string, categoryType: string): Promise<JudgingPool | null> {
  const result = await pool.query<JudgingPool>(
    `SELECT s.division_id, d.division_name, s.round_number, s.pool_id, COALESCE(d.routine_seconds, 180) AS routine_seconds
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN divisions d ON d.id = s.division_id AND d.rules_id = $4
     WHERE e.id = $1 AND e.is_playing
       AND EXISTS (SELECT 1 FROM pool_judges j
                   WHERE j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
                     AND j.player_id = $2 AND j.category_type = $3)`,
    [eventId, playerId, categoryType, JUDGING_RULES_ID]
  );
  return result.rows[0] ?? null;
}

// The pool's teams that have no routine yet (a cancelled one doesn't count),
// in play order. A running routine counts, so the team playing now isn't here.
async function getUpcomingTeams(eventId: string, at: JudgingPool): Promise<UpcomingTeam[]> {
  const [teams, info] = await Promise.all([
    getTeams(at.division_id, at.division_name),
    pool.query<{ id: string; team_name: string | null; played: boolean }>(
      `SELECT t.id, ${teamNameSql('t.id')} AS team_name,
              EXISTS (SELECT 1 FROM routines r
                      WHERE r.event_id = $1 AND r.team_id = t.id AND r.division_id = t.division_id
                        AND r.round_number = t.round_number AND r.pool_id = t.pool_id
                        AND r.status <> 'cancelled') AS played
       FROM teams t
       WHERE t.division_id = $2 AND t.round_number = $3 AND t.pool_id = $4`,
      [eventId, at.division_id, at.round_number, at.pool_id]
    ),
  ]);
  const byId = new Map(info.rows.map((r) => [r.id, r]));
  const poolTitle = poolTitleOf(at.division_name, at.round_number, at.pool_id);
  return sortPoolTeams(teams.filter((t) => t.round_number === at.round_number && t.pool_id === at.pool_id))
    .filter((t) => byId.has(t.id) && !byId.get(t.id)!.played)
    .map((t) => ({
      teamId: t.id,
      teamName: byId.get(t.id)!.team_name,
      poolTitle,
      routineSeconds: at.routine_seconds,
    }));
}

// The spacing of an averaged curve's samples, in seconds.
const OTHER_STEP = 0.5;

// What the judges of the other note-taking categories made of each routine,
// averaged per category, for drawing under this judge's own graph. Only
// routines of the event that weren't cancelled and that this judge took notes
// on, scored, or is running now are answered (the rest come back empty). A
// category counts the judges who took at least one note; a category nobody took
// notes in is left out. Each judge's curve is drawn from the category's weights
// in the event's current settings, on the same time axis rule as the graph
// (whole 30 seconds, long enough for the routine and the latest note).
export async function getOtherJudgeCurves(
  eventId: string,
  playerId: string,
  ownCategory: string,
  routineIds: string[]
): Promise<Record<string, OtherCurve[]>> {
  const categories = NOTE_CATEGORIES.filter((c) => c !== ownCategory);
  if (routineIds.length === 0 || categories.length === 0) return {};

  const allowed = await pool.query<RoutineForCurves>(
    `SELECT r.id, extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, e.judging_settings
     FROM routines r
     JOIN events e ON e.id = r.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     WHERE r.id = ANY($3::uuid[]) AND r.event_id = $1 AND r.status <> 'cancelled'
       AND (EXISTS (SELECT 1 FROM fpa2027_judge_scores sc
                    WHERE sc.routine_id = r.id AND sc.judge_player_id = $2 AND sc.category_type = $4)
            OR EXISTS (SELECT 1 FROM fpa2027_judge_notes n
                       WHERE n.routine_id = r.id AND n.player_id = $2 AND n.category_type = $4)
            OR EXISTS (SELECT 1 FROM event_play_state s
                       WHERE s.event_id = r.event_id AND s.routine_id = r.id AND s.routine_started_at IS NOT NULL))`,
    [eventId, playerId, routineIds, ownCategory]
  );
  if (allowed.rows.length === 0) return {};
  return averagedCurves(allowed.rows, categories);
}

// The averaged curves of every note-taking category for each of these routines
// (not cancelled), for the head judge's Results graph. No check of who is asking:
// the caller checks the head judge's permission.
export async function getRoutineCurves(routineIds: string[]): Promise<Record<string, OtherCurve[]>> {
  if (routineIds.length === 0) return {};
  const routines = await pool.query<RoutineForCurves>(
    `SELECT r.id, extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, e.judging_settings
     FROM routines r
     JOIN events e ON e.id = r.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     WHERE r.id = ANY($1::uuid[]) AND r.status <> 'cancelled'`,
    [routineIds]
  );
  return averagedCurves(routines.rows, NOTE_CATEGORIES);
}

type RoutineForCurves = {
  id: string;
  started_ms: number;
  routine_seconds: number;
  rules_id: string | null;
  judging_settings: unknown;
};

// Reads the notes of these routines in these categories and averages each
// category's judges' curves (see getOtherJudgeCurves).
async function averagedCurves(
  routines: RoutineForCurves[],
  categories: readonly string[]
): Promise<Record<string, OtherCurve[]>> {
  const notes = await pool.query<{
    routine_id: string;
    player_id: string;
    category_type: string;
    note_type: string;
    noted_ms: number;
    line_value: string | null;
    multiplier: string | null;
  }>(
    `SELECT routine_id, player_id, category_type, note_type, extract(epoch FROM noted_at)::float8 * 1000 AS noted_ms,
            line_value, multiplier
     FROM fpa2027_judge_notes
     WHERE routine_id = ANY($1::uuid[]) AND category_type = ANY($2::text[])`,
    [routines.map((r) => r.id), categories]
  );

  const result: Record<string, OtherCurve[]> = {};
  for (const routine of routines) {
    const settings = resolveEventSettings(routine.rules_id ?? DEFAULT_RULES_ID, routine.judging_settings);
    // category -> judge -> that judge's points
    const points = new Map<string, Map<string, CurveScore[]>>();
    let latest = 0;
    for (const n of notes.rows) {
      if (n.routine_id !== routine.id) continue;
      const t = Math.max(0, (n.noted_ms - routine.started_ms) / 1000);
      latest = Math.max(latest, t);
      const weights = categorySettings(settings, n.category_type)?.noteWeights ?? {};
      const judges = points.get(n.category_type) ?? new Map<string, CurveScore[]>();
      const list = judges.get(n.player_id) ?? [];
      list.push({
        t,
        s: notePoints(
          { noteType: n.note_type, lineValue: n.line_value === null ? null : Number(n.line_value), multiplier: n.multiplier === null ? null : Number(n.multiplier) },
          weights
        ),
      });
      judges.set(n.player_id, list);
      points.set(n.category_type, judges);
    }

    const duration = Math.max(30, Math.ceil(Math.max(routine.routine_seconds, latest) / 30) * 30);
    const curves: OtherCurve[] = [];
    for (const category of categories) {
      const judges = points.get(category);
      if (!judges || judges.size === 0) continue;
      let sum: number[] | null = null;
      for (const scores of judges.values()) {
        const { ys } = scoreCurve(scores, { duration, spread: CURVE_SPREAD, shape: CURVE_SHAPE, step: OTHER_STEP });
        sum = sum ? sum.map((v, i) => v + ys[i]) : ys;
      }
      curves.push({
        category,
        judges: judges.size,
        step: OTHER_STEP,
        ys: sum!.map((v) => Math.round((v / judges.size) * 100) / 100),
      });
    }
    if (curves.length > 0) result[routine.id] = curves;
  }
  return result;
}

async function getJudgedRoutines(
  eventId: string,
  playerId: string,
  categoryType: string,
  judging: JudgingPool | null
): Promise<Omit<JudgedRoutine, 'others'>[]> {
  const routines = await pool.query<{
    id: string;
    started_ms: number;
    routine_seconds: number;
    rules_id: string | null;
    division_name: string | null;
    round_number: number;
    pool_id: string;
    team_name: string | null;
    judging_settings: unknown;
    score: string | null;
    baseline_estimate: string | null;
    adjust_percent: string | null;
    score_settings: unknown;
  }>(
    `SELECT r.id, extract(epoch FROM r.started_at)::float8 * 1000 AS started_ms,
            COALESCE(d.routine_seconds, 180) AS routine_seconds, d.rules_id, d.division_name,
            r.round_number, r.pool_id,
            COALESCE(${routineNameSql('r.id')}, ${teamNameSql('r.team_id')}) AS team_name,
            e.judging_settings, sc.score, sc.baseline_estimate, sc.adjust_percent, sc.settings AS score_settings
     FROM routines r
     JOIN events e ON e.id = r.event_id
     LEFT JOIN divisions d ON d.id = r.division_id
     LEFT JOIN fpa2027_judge_scores sc
       ON sc.routine_id = r.id AND sc.judge_player_id = $2 AND sc.category_type = $3
     WHERE r.event_id = $1 AND r.status <> 'cancelled'
       AND (sc.id IS NOT NULL
            OR EXISTS (SELECT 1 FROM fpa2027_judge_notes n
                       WHERE n.routine_id = r.id AND n.player_id = $2 AND n.category_type = $3)
            -- The pool being judged now: its routines show even without notes.
            OR (r.division_id = $4::uuid AND r.round_number = $5::int AND r.pool_id = $6::text))
     ORDER BY r.started_at`,
    [eventId, playerId, categoryType, judging?.division_id ?? null, judging?.round_number ?? null, judging?.pool_id ?? null]
  );
  if (routines.rows.length === 0) return [];

  const notes = await pool.query<NoteRow & { routine_id: string }>(
    `SELECT n.routine_id, ${NOTE_COLUMNS}
     FROM fpa2027_judge_notes n
     WHERE n.routine_id = ANY($1::uuid[]) AND n.player_id = $2 AND n.category_type = $3
     ORDER BY n.noted_at, n.id`,
    [routines.rows.map((r) => r.id), playerId, categoryType]
  );
  const notesByRoutine = new Map<string, JudgeNote[]>();
  for (const n of notes.rows) {
    const list = notesByRoutine.get(n.routine_id) ?? [];
    list.push(toNote(n));
    notesByRoutine.set(n.routine_id, list);
  }

  return routines.rows.map((r) => {
    // The settings the score was made with; otherwise the event's current ones.
    const snapshot = r.score_settings as { rulesId?: unknown } | null;
    const settings =
      typeof snapshot?.rulesId === 'string'
        ? resolveSettings(snapshot.rulesId, snapshot)
        : resolveEventSettings(r.rules_id ?? DEFAULT_RULES_ID, r.judging_settings);
    return {
      id: r.id,
      startedAt: Math.round(r.started_ms),
      teamName: r.team_name,
      poolTitle: r.division_name ? poolTitleOf(r.division_name, r.round_number, r.pool_id) : null,
      routineSeconds: r.routine_seconds,
      notes: notesByRoutine.get(r.id) ?? [],
      submitted:
        r.score === null
          ? null
          : { score: Number(r.score), baseline: Number(r.baseline_estimate), adjustPercent: Number(r.adjust_percent) },
      noteWeights: categorySettings(settings, categoryType)?.noteWeights ?? {},
      estimate: categorySettings(settings, categoryType)?.estimate ?? DEFAULT_ESTIMATE,
    };
  });
}

// The judge's name if this person is judging this category in the event's
// playing pool right now, otherwise null (event off, pool changed, wrong link,
// or the pool's division doesn't use the Fpa2027 judging system).
export async function getJudgeAssignment(
  eventId: string,
  playerId: string,
  category: JudgingCategory
): Promise<{ name: string } | null> {
  if (!UUID.test(eventId) || !UUID.test(playerId)) return null;
  const result = await pool.query<{ first_name: string; last_name: string }>(
    `SELECT p.first_name, p.last_name
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN divisions d ON d.id = s.division_id AND d.rules_id = $4
     JOIN pool_judges j ON j.division_id = s.division_id AND j.round_number = s.round_number AND j.pool_id = s.pool_id
     JOIN players p ON p.id = j.player_id
     WHERE e.id = $1 AND e.is_playing AND j.player_id = $2 AND j.category_type = $3`,
    [eventId, playerId, category.type, JUDGING_RULES_ID]
  );
  const row = result.rows[0];
  return row ? { name: `${row.first_name} ${row.last_name}` } : null;
}
