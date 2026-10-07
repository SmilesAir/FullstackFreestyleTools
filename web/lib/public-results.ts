import 'server-only';
import { pool } from './db';
import { JUDGE_CATEGORIES, POOL_LETTERS, poolId, type RulesId } from './event-creator';
import { getEvent, getPoolJudges, getTeams } from './event-creator-queries';
import { sortPoolTeams } from './event-creator-layout';
import { getPoolResults } from './head-judge-queries';
import { roundName, type HeadJudgeJudge, type HeadJudgeTeam } from './head-judge';
import type { PoolResultsData } from './head-judge-results';
import { NOTE_CATEGORIES, JUDGING_CATEGORIES, type NoteCategory } from './judging';
import { isPoolResultsPublished } from './pool-publish';
import { getOrCreateShortCode } from './pool-shortlink';
import { getSimpleRankingResults, type SimpleRankingResultsRow } from './simple-ranking-queries';

// The public results page's only data source: no permission check anywhere
// here, and the anonymization for a published Fpa2027 pool happens here, on
// the server, so a real judge name or id is never read into a value that
// reaches the page.

const categoryLabel = (category: NoteCategory) => JUDGING_CATEGORIES.find((c) => c.type === category)!.label;

export type PoolNavEntry = { letter: string };
export type RoundNavEntry = { number: number; name: string; pools: PoolNavEntry[] };
export type DivisionNavEntry = { id: string; name: string; rounds: RoundNavEntry[] };
export type EventPoolNav = { eventId: string; eventName: string; divisions: DivisionNavEntry[] };

// Every division → round → pool letter that has teams, for the public page's
// dropdowns. Names and letters only — never judges, scores or player names
// beyond what the results view itself will show. A division's hidden/draft
// state (the Rankings Generator's own publish toggle, gating the points API)
// is a separate flag from a pool's own results_published and doesn't affect
// this: whether a pool's permalink shows anything is entirely up to that
// pool's own publish toggle, so the nav lists every division here too.
export async function getEventPoolNav(eventId: string): Promise<EventPoolNav | null> {
  const event = await getEvent(eventId);
  if (!event) return null;

  const rows = await pool.query<{ division_id: string; division_name: string; round_number: number; pool_id: string }>(
    `SELECT DISTINCT d.id AS division_id, d.division_name, t.round_number, t.pool_id
     FROM divisions d JOIN teams t ON t.division_id = d.id
     WHERE d.event_id = $1 AND t.round_number >= 1`,
    [eventId]
  );

  const divisions = new Map<string, DivisionNavEntry>();
  for (const r of rows.rows) {
    let division = divisions.get(r.division_id);
    if (!division) divisions.set(r.division_id, (division = { id: r.division_id, name: r.division_name, rounds: [] }));
    let round = division.rounds.find((x) => x.number === r.round_number);
    if (!round) {
      round = { number: r.round_number, name: roundName(r.round_number), pools: [] };
      division.rounds.push(round);
    }
    const letter = r.pool_id.replace(/^pool/i, '').toUpperCase();
    if (!round.pools.some((p) => p.letter === letter)) round.pools.push({ letter });
  }
  for (const division of divisions.values()) {
    division.rounds.sort((a, b) => b.number - a.number);
    for (const round of division.rounds) round.pools.sort((a, b) => a.letter.localeCompare(b.letter));
  }
  return { eventId, eventName: event.event_name, divisions: [...divisions.values()] };
}

// Thin public wrapper around getOrCreateShortCode, for the public page's
// dropdowns (a visitor's choice can land on a pool nobody has linked yet).
// Not sensitive: the code is a lookup key, not a secret, and the pool it
// names is already visible in the same dropdowns.
export async function resolvePoolLink(divisionId: string, roundNumber: number, letter: string): Promise<string | null> {
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return null;
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return null;
  return getOrCreateShortCode(divisionId, roundNumber, poolId(letter));
}

export type PublicPoolResult = {
  eventName: string;
  divisionName: string;
  divisionId: string;
  roundNumber: number;
  roundName: string;
  letter: string;
  usesJudges: boolean;
  published: boolean;
  routineSeconds: number;
  teams: HeadJudgeTeam[];
  // Fpa2027, not published.
  judges?: HeadJudgeJudge[];
  // Fpa2027, published: the same shape PoolSummary/NotesTable/DifficultyTable
  // already render, but every judge is an anonymized stand-in.
  judgesByCategory?: { category: NoteCategory; judges: HeadJudgeJudge[] }[];
  data?: PoolResultsData;
  // Simple Ranking (either state — the table itself is already anonymous).
  simpleRanking?: SimpleRankingResultsRow;
};

export async function getPublicPoolResults(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  letter: string
): Promise<PublicPoolResult | null> {
  if (!(POOL_LETTERS as readonly string[]).includes(letter)) return null;
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return null;

  const [event, division] = await Promise.all([
    getEvent(eventId),
    pool.query<{ division_name: string; rules_id: string; routine_seconds: number }>(
      'SELECT division_name, rules_id, routine_seconds FROM divisions WHERE id = $1 AND event_id = $2',
      [divisionId, eventId]
    ),
  ]);
  if (!event || !division.rows[0]) return null;
  const { division_name: divisionName, rules_id: rulesId, routine_seconds: routineSeconds } = division.rows[0];

  const pid = poolId(letter);
  const allTeams = await getTeams(divisionId, divisionName);
  const inPool = sortPoolTeams(allTeams.filter((t) => t.round_number === roundNumber && t.pool_id === pid));
  if (inPool.length === 0) return null;
  const teams: HeadJudgeTeam[] = inPool.map((t) => ({ id: t.id, players: t.players.map((p) => p.name), place: t.place }));

  const usesJudges = (JUDGE_CATEGORIES[rulesId as RulesId] ?? []).length > 0;
  const published = await isPoolResultsPublished(divisionId, roundNumber, pid);

  const base: PublicPoolResult = {
    eventName: event.event_name,
    divisionName,
    divisionId,
    roundNumber,
    roundName: roundName(roundNumber),
    letter,
    usesJudges,
    published,
    routineSeconds,
    teams,
  };

  if (!usesJudges) {
    const simpleRanking = await getSimpleRankingResults(divisionId, divisionName, roundNumber, letter);
    return { ...base, simpleRanking };
  }

  if (!published) {
    const allJudges = await getPoolJudges(divisionId);
    const judges: HeadJudgeJudge[] = allJudges
      .filter((j) => j.round_number === roundNumber && j.pool_id === pid)
      .map((j) => ({ playerId: j.player_id, name: j.name, categoryType: j.category_type }));
    return { ...base, judges };
  }

  const realData = await getPoolResults(eventId, divisionId, roundNumber, letter);
  const realJudges = (await getPoolJudges(divisionId)).filter((j) => j.round_number === roundNumber && j.pool_id === pid);

  // Anonymize: sort each category's real judges by name (stable order), then
  // replace every one with a fake id and a "<Category> #n" name. The real
  // name and id are only ever read here, never placed in a value below.
  const idMap = new Map<string, string>();
  const judgesByCategory = NOTE_CATEGORIES.map((category) => {
    const real = realJudges.filter((j) => j.category_type === category).sort((a, b) => a.name.localeCompare(b.name));
    const anon: HeadJudgeJudge[] = real.map((j, i) => {
      const anonId = `anon-${category}-${i + 1}`;
      idMap.set(j.player_id, anonId);
      return { playerId: anonId, name: `${categoryLabel(category)} #${i + 1}`, categoryType: category };
    });
    return { category, judges: anon };
  }).filter((c) => c.judges.length > 0);

  const data: PoolResultsData = {};
  for (const [teamId, result] of Object.entries(realData)) {
    const anonJudges: PoolResultsData[string]['judges'] = {};
    for (const [realPlayerId, judgeResult] of Object.entries(result.judges)) {
      const anonId = idMap.get(realPlayerId);
      if (anonId) anonJudges[anonId] = judgeResult;
    }
    data[teamId] = { ...result, judges: anonJudges };
  }

  return { ...base, judgesByCategory, data };
}
