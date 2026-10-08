'use client';

import { useEffect, useMemo, useState } from 'react';
import { teamName, type HeadJudgePool } from '@/lib/head-judge';
import type { PoolResultsData, TeamResult } from '@/lib/head-judge-results';
import {
  CATEGORY_NOTES,
  combineTeamCurve,
  JUDGING_CATEGORIES,
  NOTE_CATEGORIES,
  noteFullLabel,
  noteGroups,
  type NoteCategory,
} from '@/lib/judging';
import { NOTE_TINT, teamColorVar } from '@/app/judge/_components/noteStyles';
import { OthersLegend } from '@/app/judge/_components/OthersLegend';
import { graphExtent, ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import { byPlace, poolStandings } from '@/lib/pool-standings';
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
  // Hovering a Summary row highlights that team's line in the combined graph below it.
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);

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

  // The pool's judges in each category that takes notes, by name (computed,
  // and the two memos below with it, above the early return - hooks can't be
  // conditional; this doesn't depend on `pool.usesJudges` anyway). Memoized so
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

  if (!pool.usesJudges) return <SimpleRankingResults pool={pool} active={active} />;

  return (
    <div className="flex flex-col gap-4">
      <PublicLinkControl pool={pool} />
      {failed && <p className="text-xs text-amber-700">Could not load the latest results. Trying again.</p>}
      {data !== null && judgesByCategory.length > 0 && (
        <>
          <PoolSummary
            pool={pool}
            data={data}
            judgesByCategory={judgesByCategory}
            highlightedTeamId={highlightedTeamId}
            onHighlight={setHighlightedTeamId}
          />
          <PoolOverviewGraph teams={overviewTeams} routineSeconds={pool.routineSeconds} highlightedTeamId={highlightedTeamId} />
        </>
      )}
      <ol className="flex flex-col gap-4">
        {pool.teams.map((team, i) => {
          const result: TeamResult | undefined = data?.[team.id];
          const finished = result ? noteJudges.filter((j) => result.judges[j.playerId]?.submitted).length : 0;
          return (
            <li key={team.id} className="flex flex-col gap-3 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  <span className="mr-3 font-normal text-gray-400">{i + 1}.</span>
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
                      <NotesTable category={category} judges={judges} result={result} />
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

// One row per team in play order: each judge's submitted score under its
// category, then each category's total, then the team's total (all the submitted
// scores added up) and its place in the pool by that total (equal totals share
// a place). A team with no submitted score yet has no total or place.
// Exported for the public results page, which builds its own (anonymized)
// judgesByCategory and data, but wants the identical table.
export function PoolSummary({
  pool,
  data,
  judgesByCategory,
  highlightedTeamId = null,
  onHighlight,
}: {
  pool: Pick<HeadJudgePool, 'teams'>;
  data: PoolResultsData;
  judgesByCategory: { category: NoteCategory; judges: HeadJudgePool['judges'] }[];
  // Hovering a row calls onHighlight(team.id)/onHighlight(null), to highlight
  // that team's line in the combined graph below. Both optional: the table
  // works standalone (e.g. before that graph existed) without them.
  highlightedTeamId?: string | null;
  onHighlight?: (teamId: string | null) => void;
}) {
  const [sort, setSort] = useState<ResultsSortOrder>('play');

  const rows = poolStandings(pool.teams, data, judgesByCategory);
  // "By place" re-sorts the same rows best-to-worst; a team with no total yet sorts last.
  const displayRows = sort === 'place' ? [...rows].sort(byPlace) : rows;
  const dash = <span className="font-normal text-gray-400">—</span>;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SortToggle value={sort} onChange={setSort} />
        <h3 className="text-lg font-semibold">Summary</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} className="border border-gray-300 px-3 py-1.5 text-left font-medium">
                Team
              </th>
              {judgesByCategory.map(({ category, judges }) => (
                <th key={category} colSpan={judges.length} className={`${cell} font-semibold`}>
                  {categoryLabel(category)}
                </th>
              ))}
              <th colSpan={judgesByCategory.length} className={`${cell} font-semibold`}>
                Totals
              </th>
              <th rowSpan={2} className={`${cell} font-semibold`}>
                Team total
              </th>
              <th rowSpan={2} className={`${cell} font-semibold`}>
                Place
              </th>
            </tr>
            <tr>
              {judgesByCategory.flatMap(({ judges }) =>
                judges.map((j) => (
                  <th key={j.playerId} className={`${cell} font-medium`}>
                    {j.name}
                  </th>
                ))
              )}
              {judgesByCategory.map(({ category }) => (
                <th key={`${category}-total`} className={`${cell} font-medium`}>
                  {categoryLabel(category)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ team, playIndex, categories, total, place }) => {
              // By play order this always starts at 1; by place it's the
              // team's actual place (so the list reads 1, 2, 3... by rank
              // too), a dash for a team with no total yet.
              const rank = sort === 'place' ? place : playIndex + 1;
              return (
                <tr
                  key={team.id}
                  onMouseEnter={() => onHighlight?.(team.id)}
                  onMouseLeave={() => onHighlight?.(null)}
                  className={team.id === highlightedTeamId ? 'bg-yellow-100' : undefined}
                >
                  <td className="border border-gray-300 px-3 py-1.5 text-left">
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
                      <td key={`${k}-${j}`} className={cell}>
                        {score === null ? dash : score}
                      </td>
                    ))
                  )}
                  {categories.map((c, k) => (
                    <td key={`total-${k}`} className={`${cell} font-semibold`}>
                      {c.total === null ? dash : c.total}
                    </td>
                  ))}
                  <td className={`${cell} font-semibold`}>{total === null ? dash : total}</td>
                  <td className={`${cell} font-semibold`}>{place ?? dash}</td>
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

export function DifficultyTable({ judges, result }: { judges: HeadJudgePool['judges']; result: TeamResult }) {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const scores = judges.map((j) => result.judges[j.playerId]?.submitted?.score).filter((s): s is number => s !== undefined);
  const baselines = judges
    .map((j) => result.judges[j.playerId]?.submitted?.baseline)
    .filter((b): b is number => b !== undefined);
  const pointsTotal = round2(judges.reduce((sum, j) => sum + (result.judges[j.playerId]?.points ?? 0), 0));
  const notesTotal = judges.reduce((sum, j) => sum + (result.judges[j.playerId]?.moves?.length ?? 0), 0);
  const dash = <span className="font-normal text-gray-400">—</span>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            <th className="border border-gray-300 px-3 py-1.5 text-left font-medium">Judge</th>
            <th className={`${cell} font-medium`}>Notes (numberline / rating)</th>
            <th className={`${cell} font-medium`}>Points</th>
            <th className={`${cell} font-medium`}>Baseline</th>
            <th className={`${cell} font-medium`}>Score</th>
          </tr>
        </thead>
        <tbody>
          {judges.map((judge) => {
            const row = result.judges[judge.playerId];
            const submitted = row?.submitted ?? null;
            const moves = row?.moves ?? [];
            return (
              <tr key={judge.playerId}>
                <td className="border border-gray-300 px-3 py-1.5 text-left">{judge.name}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-left">
                  {moves.length === 0 ? (
                    dash
                  ) : (
                    <ul className="flex flex-wrap gap-1">
                      {moves.map((m, i) => (
                        <li key={i} className={`rounded px-2 py-0.5 ${NOTE_TINT[m.rating]}`}>
                          {scaled(m.position)} / {noteFullLabel('Diff', m.rating)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className={cell}>{row ? round2(row.points) : 0}</td>
                <td className={cell}>{submitted ? submitted.baseline : dash}</td>
                <td className={`${cell} font-semibold`}>{submitted ? submitted.score : dash}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold dark:bg-transparent">
            <td className="border border-gray-300 px-3 py-1.5 text-left">Total</td>
            <td className="border border-gray-300 px-2 py-1.5 text-left">{notesTotal} notes</td>
            <td className={cell}>{pointsTotal}</td>
            <td className={cell}>{baselines.length > 0 ? round2(baselines.reduce((a, b) => a + b, 0)) : dash}</td>
            <td className={cell}>{scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0)) : dash}</td>
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
}: {
  category: NoteCategory;
  judges: HeadJudgePool['judges'];
  result: TeamResult;
}) {
  if (category === 'Diff') return <DifficultyTable judges={judges} result={result} />;
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
        <thead>
          {hasHeadings && (
            <tr>
              <th rowSpan={2} className="border border-gray-300 px-3 py-1.5 text-left font-medium">
                Judge
              </th>
              {groups.map((group) => (
                <th key={group.heading} colSpan={group.notes.length} className={`${cell} font-semibold`}>
                  {group.heading}
                </th>
              ))}
              <th rowSpan={2} className={`${cell} font-medium`}>
                Baseline
              </th>
              <th rowSpan={2} className={`${cell} font-medium`}>
                Score
              </th>
            </tr>
          )}
          <tr>
            {!hasHeadings && <th className="border border-gray-300 px-3 py-1.5 text-left font-medium">Judge</th>}
            {notes.map((note) => (
              <th key={note.type} className={`${cell} font-medium ${NOTE_TINT[note.type]}`}>
                {note.label}
              </th>
            ))}
            {!hasHeadings && (
              <>
                <th className={`${cell} font-medium`}>Baseline</th>
                <th className={`${cell} font-medium`}>Score</th>
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
                  return (
                    <td key={note.type} className={`${cell} ${count === 0 ? 'text-gray-400' : 'font-semibold'}`}>
                      {count}
                    </td>
                  );
                })}
                <td className={cell}>{submitted ? submitted.baseline : <span className="text-gray-400">—</span>}</td>
                <td className={`${cell} font-semibold`}>{submitted ? submitted.score : dash}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold dark:bg-transparent">
            <td className="border border-gray-300 px-3 py-1.5 text-left">Total</td>
            {totals.map((total, i) => (
              <td key={notes[i].type} className={cell}>
                {total}
              </td>
            ))}
            <td className={cell}>{baselines.length > 0 ? baselineTotal : dash}</td>
            <td className={cell}>{scores.length > 0 ? scoreTotal : dash}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
