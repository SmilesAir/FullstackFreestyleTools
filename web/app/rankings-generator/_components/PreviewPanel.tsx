'use client';

import { Fragment, useMemo, useState } from 'react';
import type { GeneratorOutput } from '@/lib/points/run';
import type { RankingRow, RatingRow } from '@/lib/points/types';

export type PreviewTab = 'open' | 'women' | 'ratings';

const PAGE = 100;
const num = 'px-2 py-1.5 text-right tabular-nums';
const left = 'px-2 py-1.5 text-left tabular-nums';

function RankingTable({ rows, names, topResults, search }: { rows: RankingRow[]; names: GeneratorOutput['names']; topResults: number; search: string }) {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? rows.filter((r) => r.fullName.toLowerCase().includes(needle)) : rows;
  }, [rows, search]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className={`${left} w-16`}>Rank</th>
            <th className="px-2 py-1.5 text-left">Name</th>
            <th className={num}>Points</th>
            <th className={num}>Events</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, shown).map((row) => (
            <Fragment key={row.id}>
              <tr className="cursor-pointer border-b border-gray-200 hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setOpen(open === row.id ? null : row.id)}>
                <td className={`${left} w-16`}>{row.rank}</td>
                <td className="px-2 py-1.5 text-left">{row.fullName}</td>
                <td className={`${num} font-semibold`}>{row.points}</td>
                <td className={num}>{row.resultsCount}</td>
              </tr>
              {open === row.id && (
                <tr className="border-b border-gray-200 bg-gray-50 dark:bg-white/5">
                  <td />
                  <td colSpan={3} className="px-2 py-2">
                    <ol className="flex flex-col gap-0.5 text-xs">
                      {row.pointsList.map((item, i) => {
                        const name = names[item.resultsId];
                        return (
                          <li key={item.resultsId} className={i < topResults ? '' : 'text-gray-400'}>
                            {name ? `${name.eventName}, ${name.divisionName}` : 'Unknown event'}: {Math.round(item.points * 10) / 10}
                            {i >= topResults && ' (not counted)'}
                          </li>
                        );
                      })}
                    </ol>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <Footer shown={shown} total={filtered.length} onMore={() => setShown((n) => n + PAGE)} />
    </div>
  );
}

function RatingTable({ rows, search }: { rows: RatingRow[]; search: string }) {
  const [shown, setShown] = useState(PAGE);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.map((row, i) => ({ row, rank: i + 1 })).filter((x) => !needle || x.row.fullName.toLowerCase().includes(needle));
  }, [rows, search]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className={`${left} w-16`}>#</th>
            <th className="px-2 py-1.5 text-left">Name</th>
            <th className={num}>Rating</th>
            <th className={num}>Matches</th>
            <th className={num}>Peak rating</th>
            <th className={num}>Peak date</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, shown).map(({ row, rank }) => (
            <tr key={row.id} className="border-b border-gray-200">
              <td className={`${left} w-16`}>{rank}</td>
              <td className="px-2 py-1.5 text-left">{row.fullName}</td>
              <td className={`${num} font-semibold`}>{Math.round(row.rating)}</td>
              <td className={num}>{row.matchCount}</td>
              <td className={num}>{Math.round(row.highestRating)}</td>
              <td className={num}>{row.highestRatingDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Footer shown={shown} total={filtered.length} onMore={() => setShown((n) => n + PAGE)} />
    </div>
  );
}

function Footer({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2 text-xs text-gray-500">
      Showing {Math.min(shown, total)} of {total}
      {shown < total && (
        <button type="button" onClick={onMore} className="cursor-pointer rounded border border-gray-300 px-2 py-1 hover:bg-gray-100 dark:hover:bg-white/10">
          Show {PAGE} more
        </button>
      )}
    </div>
  );
}

// The rankings and ratings the current selection and settings give.
export function PreviewPanel({
  tab,
  onTab,
  output,
  ratings,
  updating,
  error,
  topResults,
}: {
  tab: PreviewTab;
  onTab: (tab: PreviewTab) => void;
  output: GeneratorOutput | null;
  // Null while they are being worked out.
  ratings: RatingRow[] | null;
  updating: boolean;
  error: string | null;
  topResults: number;
}) {
  const [search, setSearch] = useState('');
  const tabs: { id: PreviewTab; label: string; count: number | null }[] = [
    { id: 'open', label: 'Open rankings', count: output ? output.open.length : null },
    { id: 'women', label: 'Women rankings', count: output ? output.women.length : null },
    { id: 'ratings', label: 'Open ratings', count: ratings ? ratings.length : null },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            aria-pressed={tab === t.id}
            className={`cursor-pointer rounded border px-3 py-1.5 text-sm ${tab === t.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'}`}
          >
            {t.label}
            {t.count !== null && <span className="ml-1.5 opacity-75">({t.count})</span>}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a player"
          className="min-w-40 flex-1 rounded border border-gray-300 bg-background px-2 py-1.5 text-sm"
        />
        {updating && <span className="text-sm text-gray-500">Updating…</span>}
      </div>
      {output && (
        <p className="text-xs text-gray-500">
          {tab === 'ratings'
            ? 'Ratings use every event, whatever is selected.'
            : `${output.counts.events} events, ${output.counts.divisions} divisions${output.counts.from ? `, ${output.counts.from} to ${output.counts.to}` : ''}. Click a player for their results.`}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {tab !== 'ratings' && !output && !error && <p className="text-sm text-gray-500">Working it out…</p>}
      {tab !== 'ratings' && output && output.open.length === 0 && tab === 'open' && <p className="text-sm text-gray-500">Select some events to see rankings.</p>}
      {tab === 'open' && output && <RankingTable rows={output.open} names={output.names} topResults={topResults} search={search} />}
      {tab === 'women' && output && <RankingTable rows={output.women} names={output.names} topResults={topResults} search={search} />}
      {tab === 'ratings' && !ratings && !error && <p className="text-sm text-gray-500">Working out the ratings from every event…</p>}
      {tab === 'ratings' && ratings && <RatingTable rows={ratings} search={search} />}
    </div>
  );
}
