'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { OthersLegend } from '@/app/judge/_components/OthersLegend';
import { ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import {
  curveDuration,
  detailsOrder,
  DifficultyTable,
  NotesTable,
  poolGraphExtent,
  poolOverviewTeams,
  PoolSummary,
} from '@/app/head-judge/_components/PoolResults';
import { PoolOverviewGraph } from '@/app/head-judge/_components/PoolOverviewGraph';
import { SimpleRankingTable } from '@/app/head-judge/_components/SimpleRankingResults';
import type { ResultsSortOrder } from '@/app/head-judge/_components/SortToggle';
import { navigateToPool } from '@/lib/public-results-actions';
import type { EventPoolNav, PublicPoolResult } from '@/lib/public-results';
import { useT } from '@/lib/i18n/client';
import { categoryLabel } from '@/lib/i18n/labels';

const NO_SCORES: never[] = [];

export function PublicResultsView({ nav, result }: { nav: EventPoolNav; result: PublicPoolResult }) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const division = nav.divisions.find((d) => d.id === result.divisionId) ?? nav.divisions[0];
  const round = division?.rounds.find((r) => r.number === result.roundNumber) ?? division?.rounds[0];

  function go(divisionId: string, roundNumber: number, letter: string) {
    setError(null);
    startTransition(async () => {
      const { code } = await navigateToPool(divisionId, roundNumber, letter);
      if (!code) {
        setError(t.home.couldNotOpenPool);
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
          {result.divisionName} · {t.common.roundName(result.roundNumber)} · {t.common.pool(result.letter)}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          {t.publicPages.division}
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
          {t.publicPages.round}
          <select
            value={round?.number ?? ''}
            disabled={pending}
            onChange={(e) => changeRound(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
          >
            {division?.rounds.map((r) => (
              <option key={r.number} value={r.number}>
                {t.common.roundName(r.number)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t.publicPages.pool}
          <select
            value={result.letter}
            disabled={pending}
            onChange={(e) => changePool(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 disabled:opacity-50"
          >
            {round?.pools.map((p) => (
              <option key={p.letter} value={p.letter}>
                {t.common.pool(p.letter)}
              </option>
            ))}
          </select>
        </label>
        {pending && <span className="text-gray-500">{t.common.loading}</span>}
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
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t.publicPages.teams}</h2>
        <ol className="flex flex-col gap-1">
          {result.teams.map((team, i) => (
            <li key={team.id} className="rounded border border-gray-200 px-3 py-2">
              <span className="mr-2 text-gray-400">{i + 1}.</span>
              {team.players.join(' / ') || t.common.noPlayers}
            </li>
          ))}
        </ol>
      </section>
      {result.usesJudges ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t.publicPages.judges}</h2>
          {!result.judges || result.judges.length === 0 ? (
            <p className="text-sm text-gray-500">{t.publicPages.noJudgesYet}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {result.judges.map((j) => (
                <li key={j.playerId} className="text-sm">
                  {j.name} <span className="text-gray-500">({categoryLabel(t, j.categoryType)})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-sm text-gray-600">
          {t.publicPages.rankingsSubmitted(result.simpleRanking?.judgeCount ?? 0)}
        </p>
      )}
      <p className="text-xs text-gray-500">{t.publicPages.notPublished}</p>
    </div>
  );
}

function FpaResultsView({ result }: { result: PublicPoolResult }) {
  const t = useT();
  // Hovering a Summary row highlights that team's line in the combined graph below it.
  const [highlightedTeamId, setHighlightedTeamId] = useState<string | null>(null);
  // Checking a Summary row's box makes every score in the tables below a delta
  // against it instead of an absolute number.
  const [baselineTeamId, setBaselineTeamId] = useState<string | null>(null);
  // The Summary's sort order; each team's details below follow it.
  const [sort, setSort] = useState<ResultsSortOrder>('play');

  const data = result.data!;
  const judgesByCategory = result.judgesByCategory!;
  const noteJudges = judgesByCategory.flatMap((c) => c.judges);
  // Every team's graph in this pool shares this Y axis so they can be compared.
  const extent = poolGraphExtent(result.teams, data);
  const overviewTeams = poolOverviewTeams(result.teams, data, judgesByCategory);
  const baselineResult = baselineTeamId ? (data[baselineTeamId] ?? null) : undefined;

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
            baselineTeamId={baselineTeamId}
            onSetBaseline={setBaselineTeamId}
            sort={sort}
            onSortChange={setSort}
          />
          <PoolOverviewGraph teams={overviewTeams} routineSeconds={result.routineSeconds} highlightedTeamId={highlightedTeamId} />
        </>
      )}
      <ol className="flex flex-col gap-4">
        {detailsOrder(result.teams, data, judgesByCategory, sort).map(({ team, rank }) => {
          const teamResult = data[team.id];
          const finished = teamResult ? noteJudges.filter((j) => teamResult.judges[j.playerId]?.submitted).length : 0;
          // The baseline's own tables read their actual values, not an
          // all-zero delta against themselves - only every other team compares.
          const compareResult = team.id === baselineTeamId ? undefined : baselineResult;
          return (
            <li key={team.id} className="flex flex-col gap-3 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  <span className="mr-3 font-normal text-gray-400">{rank === null ? '—' : `${rank}.`}</span>
                  {team.players.join(' / ') || t.common.noPlayers}
                </h3>
                <span className="text-sm text-gray-500">
                  {!teamResult ? t.results.notPlayedYet : noteJudges.length === 0 ? '' : t.results.judgesFinished(finished, noteJudges.length)}
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
                      <h4 className="text-sm font-medium text-gray-600">{categoryLabel(t, category)}</h4>
                      <DifficultyTable judges={judges} result={teamResult} baselineResult={compareResult} />
                    </div>
                  ) : (
                    <div key={category} className="flex flex-col gap-1">
                      <h4 className="text-sm font-medium text-gray-600">{categoryLabel(t, category)}</h4>
                      <NotesTable category={category} judges={judges} result={teamResult} baselineResult={compareResult} />
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
