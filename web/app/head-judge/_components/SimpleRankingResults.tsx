'use client';

import { useEffect, useState } from 'react';
import type { HeadJudgePool } from '@/lib/head-judge';
import { clearSimpleRankings } from '@/lib/simple-ranking-actions';
import type { SimpleRankingResultsRow } from '@/lib/simple-ranking-queries';
import { PublicLinkControl } from './PublicLinkControl';
import { SortToggle, type ResultsSortOrder } from './SortToggle';

const POLL_MS = 5000;

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

// The results table itself: how many of each place a team got, its total
// (fewest wins) and its final place, ties broken toward the team with the
// later play order. Pure/presentational — already-anonymous (Simple Ranking
// judges are never named to begin with) — so both the Head Judge's live view
// and the public results page render this same piece from already-loaded data.
export function SimpleRankingTable({ data }: { data: SimpleRankingResultsRow }) {
  const [sort, setSort] = useState<ResultsSortOrder>('play');

  if (data.judgeCount === 0) {
    return <p className="text-sm text-gray-500">No rankings yet.</p>;
  }

  const maxPlace = Math.max(...data.rows.map((r) => r.counts.length));
  // In play order (the pool's team list), each with its already-computed place;
  // "By place" re-sorts that same data best-to-worst without recomputing it.
  const rowsByTeam = new Map(data.rows.map((r) => [r.teamId, r]));
  const rowsInPlayOrder = data.teams
    .map((t, playIndex) => {
      const row = rowsByTeam.get(t.id);
      return row ? { ...row, playIndex } : undefined;
    })
    .filter((r) => r !== undefined);
  const rows = sort === 'place' ? [...rowsInPlayOrder].sort((a, b) => a.place - b.place) : rowsInPlayOrder;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <SortToggle value={sort} onChange={setSort} />
        <p className="text-sm text-gray-600">
          {data.judgeCount} judge{data.judgeCount === 1 ? '' : 's'}
          {data.outdatedCount > 0 && ` · ${data.outdatedCount} outdated ranking${data.outdatedCount === 1 ? '' : 's'} ignored`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm tabular-nums">
          <thead>
            <tr>
              <th className="border border-gray-300 px-3 py-1.5 text-left font-medium">Team</th>
              {Array.from({ length: maxPlace }, (_, i) => (
                <th key={i} className="border border-gray-300 px-2 py-1.5 text-center font-medium">
                  {ordinal(i + 1)}
                </th>
              ))}
              <th className="border border-gray-300 px-2 py-1.5 text-center font-semibold">Total</th>
              <th className="border border-gray-300 px-3 py-1.5 text-left font-medium">Place</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.teamId}>
                <td className="border border-gray-300 px-3 py-1.5 text-left">
                  <span className="mr-2 text-gray-400">{row.playIndex + 1}.</span>
                  {data.teams.find((t) => t.id === row.teamId)?.name ?? '(unknown team)'}
                </td>
                {row.counts.map((count, place) => (
                  <td key={place} className={`border border-gray-300 px-2 py-1.5 text-center ${count === 0 ? 'text-gray-400' : 'font-semibold'}`}>
                    {count}
                  </td>
                ))}
                <td className="border border-gray-300 px-2 py-1.5 text-center font-semibold">{row.total}</td>
                <td className="border border-gray-300 px-3 py-1.5 text-left font-semibold">
                  {row.place}
                  {row.tie && <span className="ml-1 text-xs font-normal text-gray-500">(tie, won on seed)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Simple Ranking's results: every judge sends a full ranking of the pool's
// teams (best to worst). The numbers come in live: read again every few
// seconds while `active`.
export function SimpleRankingResults({ pool, active }: { pool: HeadJudgePool; active: boolean }) {
  const [data, setData] = useState<SimpleRankingResultsRow | null>(null);
  const [failed, setFailed] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({ division: pool.divisionId, round: String(pool.roundNumber), pool: pool.letter });
        const response = await fetch(`/api/head-judge/simple-results?${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const json: SimpleRankingResultsRow = await response.json();
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
  }, [active, pool.divisionId, pool.roundNumber, pool.letter]);

  async function clear() {
    if (!window.confirm('Remove every ranking submitted for this pool? This cannot be undone.')) return;
    setClearing(true);
    const result = await clearSimpleRankings(pool.divisionId, pool.roundNumber, pool.letter);
    setClearing(false);
    if (!result.error) setData((d) => (d ? { ...d, rows: d.rows.map((r) => ({ ...r, counts: r.counts.map(() => 0), total: 0, tie: false })), judgeCount: 0, outdatedCount: 0 } : d));
  }

  return (
    <div className="flex flex-col gap-3">
      <PublicLinkControl pool={pool} />
      {failed && <p className="text-xs text-amber-700">Could not load the latest results. Trying again.</p>}
      {data === null ? (
        <p className="text-sm text-gray-500">{failed ? 'Could not load the results. Trying again.' : 'Loading…'}</p>
      ) : data.judgeCount === 0 ? (
        <p className="text-sm text-gray-500">No rankings yet. Judges rank from the main landing page.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clear}
              disabled={clearing}
              className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear rankings'}
            </button>
          </div>
          <SimpleRankingTable data={data} />
        </div>
      )}
    </div>
  );
}
