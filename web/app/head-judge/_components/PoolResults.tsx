'use client';

import { useEffect, useMemo, useState } from 'react';
import { teamName, type HeadJudgePool } from '@/lib/head-judge';
import type { JudgeResult, PoolResultsData, TeamResult } from '@/lib/head-judge-results';
import {
  CATEGORY_NOTES,
  combineTeamCurve,
  JUDGING_CATEGORIES,
  NEGATIVE_NOTES,
  NOTE_CATEGORIES,
  noteFullLabel,
  noteGroups,
  type NoteCategory,
} from '@/lib/judging';
import { NOTE_TINT, teamColorVar } from '@/app/judge/_components/noteStyles';
import { OthersLegend } from '@/app/judge/_components/OthersLegend';
import { graphExtent, ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import { byPlace, poolStandings } from '@/lib/pool-standings';
import { askSupportChat, useSupportChatAvailable } from '@/app/_components/support-chat-ask';
import { PoolOverviewGraph, type OverviewTeam } from './PoolOverviewGraph';
import { PublicLinkControl } from './PublicLinkControl';
import { SimpleRankingResults } from './SimpleRankingResults';
import { SortToggle, type ResultsSortOrder } from './SortToggle';

const POLL_MS = 5000;

const NO_SCORES: never[] = [];

// The time axis the averaged curves were sampled over. Exported: the public
// results page draws the same (already-anonymous) averaged graphs.
export const curveDuration = (curves: TeamResult['curves']) => Math.max(30, ...curves.map((c) => (c.ys.length - 1) * c.step));

export const categoryLabel = (category: NoteCategory) => JUDGING_CATEGORIES.find((c) => c.type === category)!.label;

// The Y axis every team's graph in a pool should share, so they can be
// compared to each other at a glance (a team that hasn't played yet, or has
// no curves, doesn't affect it). Exported: the public results page shares it.
export function poolGraphExtent(teams: readonly { id: string }[], data: PoolResultsData): { max: number; min: number } {
  let max = 0;
  let min = 0;
  for (const team of teams) {
    const result = data[team.id];
    if (!result || result.curves.length === 0) continue;
    const e = graphExtent(NO_SCORES, curveDuration(result.curves), result.curves);
    max = Math.max(max, e.max);
    min = Math.min(min, e.min);
  }
  return { max, min };
}

// Every team's judges averaged into one line each, for the combined graph
// below the Summary table - colour slot by play order (stable across the
// Summary table's sort toggle, unlike its on-screen position), place from the
// same poolStandings() the table itself sorts by, so "by place" always means
// the same thing in both places. A team with no curve yet (hasn't played) is
// left out - same as the existing per-team overview graphs.
export function poolOverviewTeams(
  teams: HeadJudgePool['teams'],
  data: PoolResultsData,
  judgesByCategory: { judges: HeadJudgePool['judges'] }[]
): OverviewTeam[] {
  const rows = poolStandings(teams, data, judgesByCategory);
  const overview: OverviewTeam[] = [];
  rows.forEach((row, colorIndex) => {
    const curve = combineTeamCurve(data[row.team.id]?.curves ?? []);
    if (curve) overview.push({ id: row.team.id, name: teamName(row.team), place: row.place, curve, colorIndex });
  });
  return overview;
}

// The teams in the order the Summary table shows them, for the per-team details
// below it to follow: play order, or by place (best first, teams with no total
// yet last). `rank` is the number the Summary's Team column shows - the play
// order, or the place (null with no total yet).
export function detailsOrder(
  teams: HeadJudgePool['teams'],
  data: PoolResultsData | null,
  judgesByCategory: { judges: HeadJudgePool['judges'] }[],
  sort: ResultsSortOrder
): { team: HeadJudgePool['teams'][number]; rank: number | null }[] {
  if (sort === 'play' || data === null) return teams.map((team, i) => ({ team, rank: i + 1 }));
  return [...poolStandings(teams, data, judgesByCategory)].sort(byPlace).map((r) => ({ team: r.team, rank: r.place }));
}

// The results of a pool: a summary table of every team's scores and place, then
// for each team a graph of the categories' averaged lines and a table per judge
// category that takes notes (Execution, Artistic Impression, Difficulty) with a
// row per judge, counts of each note they took, and their submitted score. The
// numbers come in live: they are read again every few seconds while `active`,
// and straight away when `refreshKey` changes (a judge finishing, a routine
// starting).
export function PoolResults({
  eventId,
  pool,
  active,
  refreshKey,
}: {
  eventId: string;
  pool: HeadJudgePool;
  active: boolean;
  refreshKey?: string;
}) {
  const [data, setData] = useState<PoolResultsData | null>(null);
  const [failed, setFailed] = useState(false);
  const chatAvailable = useSupportChatAvailable();

  useEffect(() => {
    // Simple Ranking has no note-taking judges; SimpleRankingResults polls its own endpoint below.
    if (!active || !pool.usesJudges) return;
    let stopped = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({
          event: eventId,
          division: pool.divisionId,
          round: String(pool.roundNumber),
          pool: pool.letter,
        });
        const response = await fetch(`/api/head-judge/results?${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const json: PoolResultsData = await response.json();
        if (!stopped) {
          setData(json);
          setFailed(false);
        }
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, eventId, pool.divisionId, pool.roundNumber, pool.letter, pool.usesJudges, refreshKey]);

  if (!pool.usesJudges) return <SimpleRankingResults pool={pool} active={active} />;

  return (
    <div className="flex flex-col gap-4">
      <PublicLinkControl pool={pool} />
      {chatAvailable && data !== null && Object.keys(data).length > 0 && (
        <div>
          <button
            type="button"
            onClick={() =>
              askSupportChat(
                `Explain the placements in ${pool.divisionName} ${pool.roundName} pool ${pool.letter}: why is each team where it is?`
              )
            }
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
          >
            Explain these results
          </button>
        </div>
      )}
      {failed && <p className="text-xs text-amber-700">Could not load the latest results. Trying again.</p>}
      <PoolResultsView pool={pool} data={data} flagMissingScores />
    </div>
  );
}

// The results themselves, from data the caller has (null = still loading): the
// Summary table and combined graph, then each team's graph and tables. The
// Judging Trainer shows the same from the scores kept in the browser.
export function PoolResultsView({
  pool,
  data,
  scoreCell,
  flagMissingScores = false,
}: {
  pool: HeadJudgePool;
  data: PoolResultsData | null;
  // See PoolSummary.
  scoreCell?: ScoreCellFn;
  flagMissingScores?: boolean;
}) {
  // Hovering a Summary row highlights that team's line in the combined graph below it.
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);
  // Checking a Summary row's box makes every score in the tables below a delta
  // against it instead of an absolute number. undefined once threaded down =
  // "no baseline picked" (unchanged absolute display); null = picked but that
  // team has no result yet (so every delta is a dash).
  const [baselineTeamId, setBaselineTeamId] = useState<string | null>(null);
  // The Summary's sort order; each team's details below follow it.
  const [sort, setSort] = useState<ResultsSortOrder>('play');

  // The pool's judges in each category that takes notes, by name. Memoized so
  // overviewTeams below gets a stable dependency, not a fresh array every render.
  const judgesByCategory = useMemo(
    () =>
      NOTE_CATEGORIES.map((category) => ({
        category,
        judges: pool.judges.filter((j) => j.categoryType === category).sort((a, b) => a.name.localeCompare(b.name)),
      })).filter((c) => c.judges.length > 0),
    [pool.judges]
  );
  const noteJudges = judgesByCategory.flatMap((c) => c.judges);

  // Every team's graph in this pool shares this Y axis so they can be compared.
  const extent = useMemo(() => (data ? poolGraphExtent(pool.teams, data) : undefined), [data, pool.teams]);
  // Every team's judges averaged into one line each, for the combined graph.
  const overviewTeams = useMemo(
    () => (data && judgesByCategory.length > 0 ? poolOverviewTeams(pool.teams, data, judgesByCategory) : []),
    [data, pool.teams, judgesByCategory]
  );

  const baselineResult = baselineTeamId ? (data?.[baselineTeamId] ?? null) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {data !== null && judgesByCategory.length > 0 && (
        <>
          <PoolSummary
            pool={pool}
            data={data}
            judgesByCategory={judgesByCategory}
            highlightedTeamId={highlightedTeamId}
            onHighlight={setHighlightedTeamId}
            baselineTeamId={baselineTeamId}
            onSetBaseline={setBaselineTeamId}
            sort={sort}
            onSortChange={setSort}
            scoreCell={scoreCell}
            flagMissingScores={flagMissingScores}
          />
          <PoolOverviewGraph teams={overviewTeams} routineSeconds={pool.routineSeconds} highlightedTeamId={highlightedTeamId} />
        </>
      )}
      <ol className="flex flex-col gap-4">
        {detailsOrder(pool.teams, data, judgesByCategory, sort).map(({ team, rank }) => {
          const result: TeamResult | undefined = data?.[team.id];
          const finished = result ? noteJudges.filter((j) => result.judges[j.playerId]?.submitted).length : 0;
          return (
            <li key={team.id} className="flex flex-col gap-3 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  <span className="mr-3 font-normal text-gray-400">{rank === null ? '—' : `${rank}.`}</span>
                  {teamName(team)}
                </h3>
                <span className="text-sm text-gray-500">
                  {data === null
                    ? 'Loading…'
                    : !result
                      ? 'Not played yet'
                      : noteJudges.length === 0
                        ? ''
                        : `${finished} of ${noteJudges.length} judges finished`}
                </span>
              </div>

              {result && result.curves.length > 0 && (
                <div className="flex flex-col gap-1">
                  <ScoreGraph
                    overview
                    scores={NO_SCORES}
                    underlays={result.curves}
                    duration={curveDuration(result.curves)}
                    routineSeconds={pool.routineSeconds}
                    heightFactor={0.375}
                    yExtent={extent}
                  />
                  <OthersLegend others={result.curves} showYou={false} bold />
                </div>
              )}

              {result &&
                (judgesByCategory.length === 0 ? (
                  <p className="text-sm text-gray-500">No judges set for this pool.</p>
                ) : (
                  judgesByCategory.map(({ category, judges }) => (
                    <div key={category} className="flex flex-col gap-1">
                      <h4 className="text-sm font-medium text-gray-600">{categoryLabel(category)}</h4>
                      <NotesTable
                        category={category}
                        judges={judges}
                        result={result}
                        baselineResult={team.id === baselineTeamId ? undefined : baselineResult}
                      />
                    </div>
                  ))
                ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const cell = 'border border-gray-300 px-2 py-1.5 text-center';

// Header tooltips: what each column of the tables below holds. Kept free of
// note worths, since those are a per-event setting.
const CATEGORY_TIPS: Record<NoteCategory, string> = {
  Diff: 'Difficulty: how hard the moves were, rated by placing each move on a numberline',
  AI: 'Artistic Impression: teamwork, use of the music and form',
  Ex: 'Execution: how cleanly the tricks were completed, and the errors made',
};

const NOTE_TIPS: Record<string, string> = {
  large_error: 'How many Large Errors the judge noted: the most serious kind of error',
  medium_error: 'How many Medium Errors the judge noted',
  minor_error: 'How many Minor Errors the judge noted: the smallest kind of error',
  average_completion: 'How many tricks the judge noted as completed, but not cleanly',
  clean_completion: 'How many tricks the judge noted as completed cleanly: the best Execution note',
  teamwork_great: 'How many Great teamwork moments the judge noted',
  teamwork_decent: 'How many Decent teamwork moments the judge noted',
  teamwork_minor: 'How many Minor teamwork moments the judge noted',
  music_great: 'How many Great uses of the music the judge noted',
  music_decent: 'How many Decent uses of the music the judge noted',
  form_good: 'How many times the judge noted Good form',
  form_bad: 'How many times the judge noted Bad form (a fault)',
};

const GROUP_TIPS: Record<string, string> = {
  Teamwork: 'Teamwork notes: how well the players worked together',
  Music: 'Music notes: how well the routine used its music',
  Form: 'Form notes: the players’ body form, good or bad',
};

const LIMIT_TIP = ' With a limit on positive notes, a column reads "counted / taken".';

const TIPS = {
  team: 'The team, with its colour in the combined graph, and its play order (or place, when sorted by place)',
  judge: 'The judge',
  judgeScore: 'The score this judge submitted for the team',
  totals: "Each category's judges' scores added up",
  categoryTotal: (category: NoteCategory) => `All the ${categoryLabel(category)} judges' scores added up`,
  teamTotal: 'Every submitted score added up, across all categories (plus the Adjustment, if shown)',
  place: "The team's place in the pool by Team total, highest first. On equal totals the team that won more categories places higher; if that is equal too, the team that plays later wins (won on seed)",
  baseline: "The score worked out from the judge's notes, before the judge's own adjustment",
  unrestricted: ' / Unrestricted: what the baseline would have been with every note counted, past the limit on positive notes',
  score: "The score the judge submitted: the baseline after their own adjustment up or down. This is what counts in the Summary",
  diffNotes:
    'Every move the judge noted, in order: where it sits on the numberline (0 to 10) and how well it was done (Good, Average or Bad)',
  rawPoints: "The judge's counted moves added up: each move's numberline value times its rating's multiplier",
};

const baselineTip = (rows: (JudgeResult | undefined)[]) =>
  rows.some((r) => r?.unrestricted != null) ? TIPS.baseline + TIPS.unrestricted : TIPS.baseline;

// A score cell once a baseline team is picked: `value` minus `baseline`,
// signed and colored (the same green/red ScoreGraph.tsx uses for positive/
// negative scores), an em-dash if either side has no value yet, and plain
// text for an exact tie - the baseline's own row lands here naturally.
// `lowerIsBetter` flips the colors, for counts of negative notes.
function scoreDelta(value: number | null, baseline: number | null, lowerIsBetter = false) {
  if (value === null || baseline === null) return <span className="font-normal text-gray-400">—</span>;
  const delta = Math.round((value - baseline) * 100) / 100;
  if (delta === 0) return <>0</>;
  return (
    <span className={delta > 0 !== lowerIsBetter ? 'text-green-600' : 'text-red-600'}>
      {delta > 0 ? '+' : '−'}
      {Math.abs(delta)}
    </span>
  );
}

// A judge's baseline cell: with a limit of positive notes, "Baseline /
// Unrestricted" (the baseline with every note counted).
function baselineText(row: JudgeResult | undefined) {
  const submitted = row?.submitted;
  if (!submitted) return <span className="text-gray-400">—</span>;
  if (row.unrestricted === null) return <>{submitted.baseline}</>;
  return (
    <>
      {submitted.baseline} <span className="text-gray-500">/ {row.unrestricted}</span>
    </>
  );
}

// The Total row's baseline cell: both sums when any judge's score was limited.
function baselineTotalText(rows: (JudgeResult | undefined)[]) {
  const scored = rows.filter((r): r is JudgeResult => !!r?.submitted);
  if (scored.length === 0) return <span className="font-normal text-gray-400">—</span>;
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const baseline = round2(scored.reduce((sum, r) => sum + r.submitted!.baseline, 0));
  if (scored.every((r) => r.unrestricted === null)) return <>{baseline}</>;
  const unrestricted = round2(scored.reduce((sum, r) => sum + (r.unrestricted ?? r.submitted!.baseline), 0));
  return (
    <>
      {baseline} <span className="text-gray-500">/ {unrestricted}</span>
    </>
  );
}

// "Baseline", or "Baseline / Unrestricted" when any of these judges' scores was limited.
const baselineHeading = (rows: (JudgeResult | undefined)[]) =>
  rows.some((r) => r?.unrestricted != null) ? 'Baseline / Unrestricted' : 'Baseline';

// What a judge's score cell shows in place of the score (or dash), when the
// caller wants something else there: the Judging Trainer puts a Start button
// in each cell without a score. undefined = the usual cell.
export type ScoreCellFn = (teamId: string, judgePlayerId: string, score: number | null) => React.ReactNode | undefined;

// One row per team in play order: each judge's submitted score under its
// category, then each category's total, then the team's total (all the submitted
// scores added up) and its place in the pool by that total (equal totals split
// by categories won, then seed). A team with no submitted score yet has no total or place.
// Exported for the public results page, which builds its own (anonymized)
// judgesByCategory and data, but wants the identical table.
export function PoolSummary({
  pool,
  data,
  judgesByCategory,
  highlightedTeamId = null,
  onHighlight,
  baselineTeamId = null,
  onSetBaseline,
  sort: sortProp,
  onSortChange,
  scoreCell,
  flagMissingScores = false,
}: {
  pool: Pick<HeadJudgePool, 'teams'>;
  data: PoolResultsData;
  judgesByCategory: { category: NoteCategory; judges: HeadJudgePool['judges'] }[];
  // Hovering a row calls onHighlight(team.id)/onHighlight(null), to highlight
  // that team's line in the combined graph below. Both optional: the table
  // works standalone (e.g. before that graph existed) without them.
  highlightedTeamId?: string | null;
  onHighlight?: (teamId: string | null) => void;
  // Checking a row's box calls onSetBaseline(team.id); checking a different
  // row moves it there; unchecking the current one calls onSetBaseline(null).
  // Both optional, same reasoning as highlightedTeamId above.
  baselineTeamId?: string | null;
  onSetBaseline?: (teamId: string | null) => void;
  // The sort order, when the caller keeps it (so the details below the table
  // can follow it - see detailsOrder); otherwise the table keeps its own.
  sort?: ResultsSortOrder;
  onSortChange?: (order: ResultsSortOrder) => void;
  scoreCell?: ScoreCellFn;
  // The head judge's own view: a team some judges have scored but not all
  // gets a red row, its missing scores a stronger red, so a judge who hasn't
  // finished (or whose score went missing) stands out. A team nobody has
  // scored yet isn't flagged - it just hasn't played.
  flagMissingScores?: boolean;
}) {
  const [ownSort, setOwnSort] = useState<ResultsSortOrder>('play');
  const sort = sortProp ?? ownSort;
  const setSort = onSortChange ?? setOwnSort;

  const rows = poolStandings(pool.teams, data, judgesByCategory);
  // "By place" re-sorts the same rows best-to-worst; a team with no total yet sorts last.
  const displayRows = sort === 'place' ? [...rows].sort(byPlace) : rows;
  const dash = <span className="font-normal text-gray-400">—</span>;
  const baselineRow = baselineTeamId ? rows.find((r) => r.team.id === baselineTeamId) : undefined;
  const baselineTeam = baselineRow?.team;
  // The Adjustment column only shows when the pool has one.
  const showAdjustment = rows.some((r) => (r.adjustment ?? 0) > 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SortToggle value={sort} onChange={setSort} />
        <h3 className="text-lg font-semibold">Summary</h3>
        {baselineTeam && <span className="text-sm text-gray-500">— compared to {teamName(baselineTeam)}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-gray-300 px-3 py-1.5 text-left font-medium" title={TIPS.team}>
                Team
              </th>
              {judgesByCategory.map(({ category, judges }) => (
                <th key={category} colSpan={judges.length} className={`${cell} font-semibold`} title={CATEGORY_TIPS[category]}>
                  {categoryLabel(category)}
                </th>
              ))}
              <th
                colSpan={judgesByCategory.length + (showAdjustment ? 1 : 0)}
                className={`${cell} font-semibold`}
                title={TIPS.totals}
              >
                Totals
              </th>
              <th rowSpan={2} className={`${cell} font-semibold`} title={TIPS.teamTotal}>
                Team total
              </th>
              <th rowSpan={2} className={`${cell} font-semibold`} title={TIPS.place}>
                Place
              </th>
            </tr>
            <tr>
              {judgesByCategory.flatMap(({ judges }) =>
                judges.map((j) => (
                  <th key={j.playerId} className={`${cell} font-medium`} title={TIPS.judgeScore}>
                    {j.name}
                  </th>
                ))
              )}
              {judgesByCategory.map(({ category }) => (
                <th key={`${category}-total`} className={`${cell} font-medium`} title={TIPS.categoryTotal(category)}>
                  {categoryLabel(category)}
                </th>
              ))}
              {showAdjustment && (
                <th
                  className={`${cell} font-medium`}
                  title="A whole number added to every team's total so all of them are above zero"
                >
                  Adjustment
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ team, playIndex, categories, adjustment, total, place, tieBreak }) => {
              // By play order this always starts at 1; by place it's the
              // team's actual place (so the list reads 1, 2, 3... by rank
              // too), a dash for a team with no total yet.
              const rank = sort === 'place' ? place : playIndex + 1;
              const showCheckbox = team.id === highlightedTeamId || team.id === baselineTeamId;
              // The baseline's own row reads its actual scores, not an
              // all-zero delta against itself - only every other row compares.
              const compareRow = team.id === baselineTeamId ? undefined : baselineRow;
              const scores = categories.flatMap((c) => c.scores);
              const missingJudges = flagMissingScores && scores.some((s) => s !== null)
                ? categories.flatMap((c, k) =>
                    c.scores.flatMap((s, j) => (s === null ? [judgesByCategory[k].judges[j].name] : []))
                  )
                : [];
              const missing = missingJudges.length > 0;
              return (
                <tr
                  key={team.id}
                  onMouseEnter={() => onHighlight?.(team.id)}
                  onMouseLeave={() => onHighlight?.(null)}
                  title={missing ? `Waiting for ${missingJudges.join(', ')}` : undefined}
                  className={
                    team.id === highlightedTeamId
                      ? 'bg-yellow-100'
                      : missing
                        ? 'bg-red-50 outline outline-2 -outline-offset-2 outline-red-500'
                        : team.id === baselineTeamId
                          ? 'bg-blue-50'
                          : undefined
                  }
                >
                  <td className="border border-gray-300 px-3 py-1.5 text-left">
                    <input
                      type="checkbox"
                      aria-label={`Compare to ${teamName(team)}`}
                      checked={team.id === baselineTeamId}
                      onChange={(e) => onSetBaseline?.(e.target.checked ? team.id : null)}
                      className={`mr-2 align-middle ${showCheckbox ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                    />
                    <span
                      aria-hidden
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ background: teamColorVar(playIndex) }}
                    />
                    <span className="mr-2 text-gray-400">{rank === null ? dash : `${rank}.`}</span>
                    {teamName(team)}
                  </td>
                  {categories.flatMap((c, k) =>
                    c.scores.map((score, j) => (
                      <td
                        key={`${k}-${j}`}
                        className={missing && score === null ? `${cell} bg-red-200 font-semibold text-red-700` : cell}
                      >
                        {scoreCell?.(team.id, judgesByCategory[k].judges[j].playerId, score) ??
                          (missing && score === null
                            ? 'waiting'
                            : compareRow
                              ? scoreDelta(score, compareRow.categories[k].scores[j])
                              : score === null
                                ? dash
                                : score)}
                      </td>
                    ))
                  )}
                  {categories.map((c, k) => (
                    <td key={`total-${k}`} className={`${cell} font-semibold`}>
                      {compareRow ? scoreDelta(c.total, compareRow.categories[k].total) : c.total === null ? dash : c.total}
                    </td>
                  ))}
                  {showAdjustment && (
                    <td className={`${cell} font-semibold`}>
                      {compareRow
                        ? scoreDelta(adjustment, compareRow.adjustment)
                        : adjustment === null
                          ? dash
                          : `+${adjustment}`}
                    </td>
                  )}
                  <td className={`${cell} font-semibold`}>
                    {compareRow ? scoreDelta(total, compareRow.total) : total === null ? dash : total}
                  </td>
                  <td className={`${cell} font-semibold`}>
                    {place ?? dash}
                    {tieBreak && <span className="ml-1 text-xs font-normal text-gray-500">(tie, won on {tieBreak})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// A row per judge, a column per note (under its area heading, if the category
// has areas), then the judge's baseline and score; a total row underneath.
// Difficulty's notes as numberline / rating pairs, in the order taken. The
// numberline position is only shown here as a number, scaled to 0 to 10 whatever
// the numberline's max was.
const scaled = (position: number) => (position * 10).toFixed(1);

export function DifficultyTable({
  judges,
  result,
  baselineResult,
}: {
  judges: HeadJudgePool['judges'];
  result: TeamResult;
  // See NotesTable: undefined = no baseline picked (unchanged "Total" row),
  // null = picked but that team has no result yet, an object = picked with data.
  baselineResult?: TeamResult | null;
}) {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const scores = judges.map((j) => result.judges[j.playerId]?.submitted?.score).filter((s): s is number => s !== undefined);
  const baselines = judges
    .map((j) => result.judges[j.playerId]?.submitted?.baseline)
    .filter((b): b is number => b !== undefined);
  const pointsTotal = round2(judges.reduce((sum, j) => sum + (result.judges[j.playerId]?.points ?? 0), 0));
  const notesTotal = judges.reduce((sum, j) => sum + (result.judges[j.playerId]?.moves?.length ?? 0), 0);
  const dash = <span className="font-normal text-gray-400">—</span>;
  const comparing = baselineResult !== undefined;
  const compareNotesTotal = baselineResult
    ? judges.reduce((sum, j) => sum + (baselineResult.judges[j.playerId]?.moves?.length ?? 0), 0)
    : null;
  const baselineScores = baselineResult
    ? judges.map((j) => baselineResult.judges[j.playerId]?.submitted?.score).filter((s): s is number => s !== undefined)
    : [];
  const scoreTotal = scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0)) : null;
  const baselineScoreTotal = baselineScores.length > 0 ? round2(baselineScores.reduce((a, b) => a + b, 0)) : null;
  const baselineTotal = baselines.length > 0 ? round2(baselines.reduce((a, b) => a + b, 0)) : null;
  const compareBaselines = baselineResult
    ? judges.map((j) => baselineResult.judges[j.playerId]?.submitted?.baseline).filter((b): b is number => b !== undefined)
    : [];
  const compareBaselineTotal = compareBaselines.length > 0 ? round2(compareBaselines.reduce((a, b) => a + b, 0)) : null;
  const rows = judges.map((j) => result.judges[j.playerId]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            <th className="border border-gray-300 px-3 py-1.5 text-left font-medium" title={TIPS.judge}>
              Judge
            </th>
            <th className={`${cell} font-medium`} title={TIPS.diffNotes}>
              Notes (numberline / rating)
            </th>
            <th className={`${cell} font-medium`} title={TIPS.rawPoints}>
              Raw Points
            </th>
            <th className={`${cell} font-medium`} title={baselineTip(rows)}>
              {baselineHeading(rows)}
            </th>
            <th className={`${cell} font-medium`} title={TIPS.score}>
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {judges.map((judge) => {
            const row = result.judges[judge.playerId];
            const submitted = row?.submitted ?? null;
            const moves = row?.moves ?? [];
            const dropped = moves.filter((m) => !m.counted).length;
            return (
              <tr key={judge.playerId}>
                <td className="border border-gray-300 px-3 py-1.5 text-left">{judge.name}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-left">
                  {moves.length === 0 ? (
                    dash
                  ) : (
                    <>
                      {/* Past the limit of positive notes, a move doesn't count: the counted ones are ringed. */}
                      <ul className="flex flex-wrap gap-1">
                        {moves.map((m, i) => (
                          <li
                            key={i}
                            title={m.counted ? undefined : 'Not counted (over the limit)'}
                            className={`rounded px-2 py-0.5 ${
                              !m.counted
                                ? 'bg-gray-100 text-gray-400 line-through'
                                : dropped > 0
                                  ? `ring-2 ring-blue-500 ${NOTE_TINT[m.rating]}`
                                  : NOTE_TINT[m.rating]
                            }`}
                          >
                            {scaled(m.position)} / {noteFullLabel('Diff', m.rating)}
                          </li>
                        ))}
                      </ul>
                      {dropped > 0 && (
                        <p className="mt-1 text-xs text-gray-500">
                          {moves.length - dropped} of {moves.length} counted
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className={cell}>{row ? round2(row.points) : 0}</td>
                <td className={cell}>{baselineText(row)}</td>
                <td className={`${cell} font-semibold`}>{submitted ? submitted.score : dash}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold dark:bg-transparent">
            <td className="border border-gray-300 px-3 py-1.5 text-left">{comparing ? 'Delta' : 'Total'}</td>
            <td className="border border-gray-300 px-2 py-1.5 text-left">
              {comparing ? scoreDelta(notesTotal, compareNotesTotal) : notesTotal} notes
            </td>
            <td className={cell}>{pointsTotal}</td>
            <td className={cell}>{comparing ? scoreDelta(baselineTotal, compareBaselineTotal) : baselineTotalText(rows)}</td>
            <td className={cell}>{comparing ? scoreDelta(scoreTotal, baselineScoreTotal) : (scoreTotal ?? dash)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function NotesTable({
  category,
  judges,
  result,
  baselineResult,
}: {
  category: NoteCategory;
  judges: HeadJudgePool['judges'];
  result: TeamResult;
  baselineResult?: TeamResult | null;
}) {
  if (category === 'Diff') return <DifficultyTable judges={judges} result={result} baselineResult={baselineResult} />;
  const groups = noteGroups(category);
  const hasHeadings = groups.some((g) => g.heading !== null);
  const notes = CATEGORY_NOTES[category];

  const totals = notes.map((note) =>
    judges.reduce((sum, j) => sum + (result.judges[j.playerId]?.counts[note.type] ?? 0), 0)
  );
  const scores = judges.map((j) => result.judges[j.playerId]?.submitted?.score).filter((s): s is number => s !== undefined);
  const scoreTotal = Math.round(scores.reduce((a, b) => a + b, 0) * 100) / 100;
  const baselines = judges
    .map((j) => result.judges[j.playerId]?.submitted?.baseline)
    .filter((b): b is number => b !== undefined);
  const baselineTotal = Math.round(baselines.reduce((a, b) => a + b, 0) * 100) / 100;
  const dash = <span className="font-normal text-gray-400">—</span>;
  const comparing = baselineResult !== undefined;
  const compareScores = baselineResult
    ? judges.map((j) => baselineResult.judges[j.playerId]?.submitted?.score).filter((s): s is number => s !== undefined)
    : [];
  const compareScoreTotal = compareScores.length > 0 ? Math.round(compareScores.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  // One per note type, matching `totals`' order - null (not 0) when the
  // baseline team has no result yet, so that column shows a dash instead of
  // a misleading "scored zero of everything" delta.
  const compareTotals = notes.map((note) =>
    baselineResult ? judges.reduce((sum, j) => sum + (baselineResult.judges[j.playerId]?.counts[note.type] ?? 0), 0) : null
  );
  const compareBaselines = baselineResult
    ? judges.map((j) => baselineResult.judges[j.playerId]?.submitted?.baseline).filter((b): b is number => b !== undefined)
    : [];
  const compareBaselineTotal = compareBaselines.length > 0 ? Math.round(compareBaselines.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const rows = judges.map((j) => result.judges[j.playerId]);
  const heading = baselineHeading(rows);
  // With a limit of positive notes, those columns read "counted / taken".
  const limitedType = (type: string) => rows.some((r) => r?.used && Object.hasOwn(r.used, type));
  const counted = (row: JudgeResult | undefined, type: string) =>
    row?.used && Object.hasOwn(row.used, type) ? row.used[type] : (row?.counts[type] ?? 0);
  const countedTotals = notes.map((note) => rows.reduce((sum, row) => sum + counted(row, note.type), 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
        <thead>
          {hasHeadings && (
            <tr>
              <th rowSpan={2} className="border border-gray-300 px-3 py-1.5 text-left font-medium" title={TIPS.judge}>
                Judge
              </th>
              {groups.map((group) => (
                <th
                  key={group.heading}
                  colSpan={group.notes.length}
                  className={`${cell} font-semibold`}
                  title={group.heading ? GROUP_TIPS[group.heading] : undefined}
                >
                  {group.heading}
                </th>
              ))}
              <th rowSpan={2} className={`${cell} font-medium`} title={baselineTip(rows)}>
                {heading}
              </th>
              <th rowSpan={2} className={`${cell} font-medium`} title={TIPS.score}>
                Score
              </th>
            </tr>
          )}
          <tr>
            {!hasHeadings && (
              <th className="border border-gray-300 px-3 py-1.5 text-left font-medium" title={TIPS.judge}>
                Judge
              </th>
            )}
            {notes.map((note) => (
              <th
                key={note.type}
                className={`${cell} font-medium ${NOTE_TINT[note.type]}`}
                title={NOTE_TIPS[note.type] + (limitedType(note.type) ? LIMIT_TIP : '')}
              >
                {note.label}
              </th>
            ))}
            {!hasHeadings && (
              <>
                <th className={`${cell} font-medium`} title={baselineTip(rows)}>
                  {heading}
                </th>
                <th className={`${cell} font-medium`} title={TIPS.score}>
                  Score
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {judges.map((judge) => {
            const row = result.judges[judge.playerId];
            const submitted = row?.submitted ?? null;
            return (
              <tr key={judge.playerId}>
                <td className="border border-gray-300 px-3 py-1.5 text-left">{judge.name}</td>
                {notes.map((note) => {
                  const count = row?.counts[note.type] ?? 0;
                  // Past the limit of positive notes: "counted / taken".
                  const limitedCount = row?.used && Object.hasOwn(row.used, note.type);
                  return (
                    <td key={note.type} className={`${cell} ${count === 0 ? 'text-gray-400' : 'font-semibold'}`}>
                      {limitedCount ? `${row.used![note.type]} / ${count}` : count}
                    </td>
                  );
                })}
                <td className={cell}>{baselineText(row)}</td>
                <td className={`${cell} font-semibold`}>{submitted ? submitted.score : dash}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold dark:bg-transparent">
            <td className="border border-gray-300 px-3 py-1.5 text-left">{comparing ? 'Delta' : 'Total'}</td>
            {totals.map((total, i) => (
              <td key={notes[i].type} className={cell}>
                {comparing
                  ? scoreDelta(total, compareTotals[i], NEGATIVE_NOTES.has(notes[i].type))
                  : limitedType(notes[i].type)
                    ? `${countedTotals[i]} / ${total}`
                    : total}
              </td>
            ))}
            <td className={cell}>
              {comparing
                ? scoreDelta(baselines.length > 0 ? baselineTotal : null, compareBaselineTotal)
                : baselineTotalText(rows)}
            </td>
            <td className={cell}>
              {comparing ? scoreDelta(scores.length > 0 ? scoreTotal : null, compareScoreTotal) : scores.length > 0 ? scoreTotal : dash}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
