'use client';

import { useEffect, useState } from 'react';
import { teamName, type HeadJudgePool } from '@/lib/head-judge';
import type { PoolResultsData, TeamResult } from '@/lib/head-judge-results';
import {
  CATEGORY_NOTES,
  JUDGING_CATEGORIES,
  NOTE_CATEGORIES,
  noteFullLabel,
  noteGroups,
  type NoteCategory,
} from '@/lib/judging';
import { NOTE_TINT } from '@/app/judge/_components/noteStyles';
import { OthersLegend } from '@/app/judge/_components/OthersLegend';
import { ScoreGraph } from '@/app/judge/_components/ScoreGraph';

const POLL_MS = 5000;

const NO_SCORES: never[] = [];

// The time axis the averaged curves were sampled over.
const curveDuration = (curves: TeamResult['curves']) => Math.max(30, ...curves.map((c) => (c.ys.length - 1) * c.step));

const categoryLabel = (category: NoteCategory) => JUDGING_CATEGORIES.find((c) => c.type === category)!.label;

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

  useEffect(() => {
    if (!active) return;
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
  }, [active, eventId, pool.divisionId, pool.roundNumber, pool.letter, refreshKey]);

  // The pool's judges in each category that takes notes, by name.
  const judgesByCategory = NOTE_CATEGORIES.map((category) => ({
    category,
    judges: pool.judges.filter((j) => j.categoryType === category).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((c) => c.judges.length > 0);
  const noteJudges = judgesByCategory.flatMap((c) => c.judges);

  return (
    <div className="flex flex-col gap-4">
      {failed && <p className="text-xs text-amber-700">Could not load the latest results. Trying again.</p>}
      {data !== null && judgesByCategory.length > 0 && (
        <PoolSummary pool={pool} data={data} judgesByCategory={judgesByCategory} />
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

const round2 = (v: number) => Math.round(v * 100) / 100;

// One row per team in play order: each judge's submitted score under its
// category, then each category's total, then the team's total (all the submitted
// scores added up) and its place in the pool by that total (equal totals share
// a place). A team with no submitted score yet has no total or place.
function PoolSummary({
  pool,
  data,
  judgesByCategory,
}: {
  pool: HeadJudgePool;
  data: PoolResultsData;
  judgesByCategory: { category: NoteCategory; judges: HeadJudgePool['judges'] }[];
}) {
  const rows = pool.teams.map((team) => {
    const result = data[team.id];
    const categories = judgesByCategory.map(({ judges }) => {
      const scores = judges.map((j) => result?.judges[j.playerId]?.submitted?.score ?? null);
      const submitted = scores.filter((s): s is number => s !== null);
      return { scores, total: submitted.length > 0 ? round2(submitted.reduce((a, b) => a + b, 0)) : null };
    });
    const totals = categories.map((c) => c.total).filter((t): t is number => t !== null);
    return { team, categories, total: totals.length > 0 ? round2(totals.reduce((a, b) => a + b, 0)) : null };
  });
  const placeOf = (total: number | null) =>
    total === null ? null : 1 + rows.filter((r) => r.total !== null && r.total > total).length;
  const dash = <span className="font-normal text-gray-400">—</span>;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">Summary</h3>
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
            {rows.map(({ team, categories, total }, i) => (
              <tr key={team.id}>
                <td className="border border-gray-300 px-3 py-1.5 text-left">
                  <span className="mr-2 text-gray-400">{i + 1}.</span>
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
                <td className={`${cell} font-semibold`}>{placeOf(total) ?? dash}</td>
              </tr>
            ))}
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

function DifficultyTable({ judges, result }: { judges: HeadJudgePool['judges']; result: TeamResult }) {
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

function NotesTable({
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
