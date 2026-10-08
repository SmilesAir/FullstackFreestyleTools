'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OthersLegend } from '@/app/judge/_components/OthersLegend';
import { ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import {
  categoryLabel,
  curveDuration,
  DifficultyTable,
  NotesTable,
  poolGraphExtent,
  poolOverviewTeams,
  PoolSummary,
} from '@/app/head-judge/_components/PoolResults';
import { PoolOverviewGraph } from '@/app/head-judge/_components/PoolOverviewGraph';
import { SimpleRankingTable } from '@/app/head-judge/_components/SimpleRankingResults';
import { navigateToPool } from '@/lib/public-results-actions';
import type { EventPoolNav, PublicPoolResult } from '@/lib/public-results';

const NO_SCORES: never[] = [];

export function PublicResultsView({ nav, result }: { nav: EventPoolNav; result: PublicPoolResult }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const division = nav.divisions.find((d) => d.id === result.divisionId) ?? nav.divisions[0];
  const round = division?.rounds.find((r) => r.number === result.roundNumber) ?? division?.rounds[0];

  function go(divisionId: string, roundNumber: number, letter: string) {
    setError(null);
    startTransition(async () => {
      const { code } = await navigateToPool(divisionId, roundNumber, letter);
      if (!code) {
        setError('Could not open that pool.');
        return;
      }
      router.push(`/r/${code}`);
    });
  }

  function changeDivision(divisionId: string) {
    const d = nav.divisions.find((x) => x.id === divisionId);
    const r = d?.rounds[0];
    const p = r?.pools[0];
    if (d && r && p) go(d.id, r.number, p.letter);
  }

  function changeRound(roundNumber: number) {
    const r = division?.rounds.find((x) => x.number === roundNumber);
    const p = r?.pools[0];
    if (division && r && p) go(division.id, r.number, p.letter);
  }

  function changePool(letter: string) {
    if (division && round) go(division.id, round.number, letter);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{nav.eventName}</h1>
        <p className="mt-1 text-lg text-gray-700">
          {result.divisionName} · {result.roundName} · Pool {result.letter}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Division
          <select
            value={division?.id ?? ''}
            disabled={pending}
            onChange={(e) => changeDivision(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
          >
            {nav.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Round
          <select
            value={round?.number ?? ''}
            disabled={pending}
            onChange={(e) => changeRound(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
          >
            {division?.rounds.map((r) => (
              <option key={r.number} value={r.number}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Pool
          <select
            value={result.letter}
            disabled={pending}
            onChange={(e) => changePool(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
          >
            {round?.pools.map((p) => (
              <option key={p.letter} value={p.letter}>
                Pool {p.letter}
              </option>
            ))}
          </select>
        </label>
        {pending && <span className="text-gray-500">Loading…</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!result.published ? (
        <UnpublishedView result={result} />
      ) : result.usesJudges ? (
        <FpaResultsView result={result} />
      ) : (
        <SimpleRankingTable data={result.simpleRanking!} />
      )}
    </div>
  );
}

function UnpublishedView({ result }: { result: PublicPoolResult }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Teams</h2>
        <ol className="flex flex-col gap-1">
          {result.teams.map((team, i) => (
            <li key={team.id} className="rounded border border-gray-200 px-3 py-2">
              <span className="mr-2 text-gray-400">{i + 1}.</span>
              {team.players.join(' / ') || '(no players)'}
            </li>
          ))}
        </ol>
      </section>
      {result.usesJudges ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Judges</h2>
          {!result.judges || result.judges.length === 0 ? (
            <p className="text-sm text-gray-500">No judges set yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {result.judges.map((j) => (
                <li key={j.playerId} className="text-sm">
                  {j.name} <span className="text-gray-500">({categoryLabel(j.categoryType as 'Ex' | 'AI' | 'Diff')})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-sm text-gray-600">
          {result.simpleRanking?.judgeCount ?? 0} ranking{(result.simpleRanking?.judgeCount ?? 0) === 1 ? '' : 's'} submitted so far.
        </p>
      )}
      <p className="text-xs text-gray-500">Results aren&apos;t published yet.</p>
    </div>
  );
}

function FpaResultsView({ result }: { result: PublicPoolResult }) {
  // Hovering a Summary row highlights that team's line in the combined graph below it.
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);

  const data = result.data!;
  const judgesByCategory = result.judgesByCategory!;
  const noteJudges = judgesByCategory.flatMap((c) => c.judges);
  // Every team's graph in this pool shares this Y axis so they can be compared.
  const extent = poolGraphExtent(result.teams, data);
  const overviewTeams = poolOverviewTeams(result.teams, data, judgesByCategory);

  return (
    <div className="flex flex-col gap-4">
      {judgesByCategory.length > 0 && (
        <>
          <PoolSummary
            pool={{ teams: result.teams }}
            data={data}
            judgesByCategory={judgesByCategory}
            highlightedTeamId={highlightedTeamId}
            onHighlight={setHighlightedTeamId}
          />
          <PoolOverviewGraph teams={overviewTeams} routineSeconds={result.routineSeconds} highlightedTeamId={highlightedTeamId} />
        </>
      )}
      <ol className="flex flex-col gap-4">
        {result.teams.map((team, i) => {
          const teamResult = data[team.id];
          const finished = teamResult ? noteJudges.filter((j) => teamResult.judges[j.playerId]?.submitted).length : 0;
          return (
            <li key={team.id} className="flex flex-col gap-3 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  <span className="mr-3 font-normal text-gray-400">{i + 1}.</span>
                  {team.players.join(' / ') || '(no players)'}
                </h3>
                <span className="text-sm text-gray-500">
                  {!teamResult ? 'Not played yet' : noteJudges.length === 0 ? '' : `${finished} of ${noteJudges.length} judges finished`}
                </span>
              </div>
              {teamResult && teamResult.curves.length > 0 && (
                <div className="flex flex-col gap-1">
                  <ScoreGraph
                    overview
                    scores={NO_SCORES}
                    underlays={teamResult.curves}
                    duration={curveDuration(teamResult.curves)}
                    routineSeconds={result.routineSeconds}
                    heightFactor={0.375}
                    yExtent={extent}
                  />
                  <OthersLegend others={teamResult.curves} showYou={false} bold />
                </div>
              )}
              {teamResult &&
                judgesByCategory.map(({ category, judges }) =>
                  category === 'Diff' ? (
                    <div key={category} className="flex flex-col gap-1">
                      <h4 className="text-sm font-medium text-gray-600">{categoryLabel(category)}</h4>
                      <DifficultyTable judges={judges} result={teamResult} />
                    </div>
                  ) : (
                    <div key={category} className="flex flex-col gap-1">
                      <h4 className="text-sm font-medium text-gray-600">{categoryLabel(category)}</h4>
                      <NotesTable category={category} judges={judges} result={teamResult} />
                    </div>
                  )
                )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
