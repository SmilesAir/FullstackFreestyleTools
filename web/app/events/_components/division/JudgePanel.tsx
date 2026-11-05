'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadJudgeCandidates } from '@/lib/event-creator-actions';
import { formatJudgeCount, type JudgeCandidate } from '@/lib/event-creator';
import type { JudgeDrag, JudgePanelTarget } from './DivisionWorkspace';
import { placedKey } from './DivisionWorkspace';
import { useT } from '@/lib/i18n/client';
import { categoryShort } from '@/lib/i18n/labels';

// Most rows drawn at once; searching narrows the rest.
const MAX_ROWS = 200;
const NO_CANDIDATES: JudgeCandidate[] = [];

// The Set Judges panel, fixed to the bottom of the window. Players are dragged
// from here into the judging columns of the pool it was opened for.
export function JudgePanel({
  divisionId,
  categories,
  target,
  refreshKey,
  placed,
  onListed,
  onClose,
  onDragStart,
  onDragEnd,
}: {
  divisionId: string;
  categories: readonly string[];
  target: JudgePanelTarget;
  // Changes when judges are saved, so the counts are reloaded.
  refreshKey: number;
  // Players just placed as judges in some pool, not yet gone from a reloaded list.
  placed: readonly string[];
  // Tells the workspace which players the latest list still has for a pool.
  onListed: (poolKey: string, listed: ReadonlySet<string>) => void;
  onClose: () => void;
  onDragStart: (drag: JudgeDrag) => void;
  onDragEnd: () => void;
}) {
  const t = useT();
  const [loaded, setLoaded] = useState<{ key: string; candidates: JudgeCandidate[]; error: string | null } | null>(null);
  const [search, setSearch] = useState('');

  const key = `${target.roundNumber}:${target.letter}:${refreshKey}`;
  useEffect(() => {
    let cancelled = false;
    loadJudgeCandidates(divisionId, target.roundNumber, target.letter)
      .then((result) => {
        if (cancelled) return;
        setLoaded({ key, candidates: result.candidates, error: result.error });
        onListed(`${target.roundNumber}:${target.letter}`, new Set(result.candidates.map((c) => c.id)));
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, candidates: [], error: t.events.couldNotLoadPlayers });
      });
    return () => {
      cancelled = true;
    };
  }, [divisionId, target.roundNumber, target.letter, key, onListed, t]);

  // Keep showing the previous list while a newer one loads, but not another pool's.
  const candidates = loaded?.candidates ?? NO_CANDIDATES;
  const loading = !loaded || loaded.key !== key;

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Players just placed in this pool are already gone from the list.
    const gone = new Set(placed);
    const available = candidates.filter((c) => !gone.has(placedKey(target.roundNumber, target.letter, c.id)));
    const matches = needle ? available.filter((c) => c.name.toLowerCase().includes(needle)) : available;
    return { rows: matches.slice(0, MAX_ROWS), total: matches.length };
  }, [candidates, search, placed, target.roundNumber, target.letter]);

  const legend = [t.events.event, ...categories.map((c) => categoryShort(t, c))].join('-');

  return (
    <section
      aria-label={t.events.setJudges}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[35vh] flex-col border-t-2 border-gray-400 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.15)]"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 px-4 py-2">
        <h2 className="font-semibold">
          {t.events.setJudgesTitle(target.roundName, t.common.pool(target.letter))}
        </h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.events.searchPlayers}
          className="w-56 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-500">
          {t.events.judgesHelp(legend)}
        </span>
        <button type="button" onClick={onClose} className="ml-auto rounded border border-gray-300 px-3 py-1 text-sm">
          {t.common.close}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {loaded?.error && <p className="text-sm text-red-600">{loaded.error}</p>}
        {loading && candidates.length === 0 && !loaded?.error && <p className="text-sm text-gray-500">{t.events.loadingPlayers}</p>}
        <ul className="grid grid-cols-4 gap-x-3 gap-y-1">
          {shown.rows.map((c) => (
            <li
              key={c.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', c.id);
                onDragStart({ playerId: c.id, name: c.name, eventCount: c.eventCount, counts: c.counts, source: 'panel' });
              }}
              onDragEnd={onDragEnd}
              title={c.playingIn ? t.events.competingIn(c.playingIn) : undefined}
              className={`cursor-move rounded border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 ${
                c.playingIn ? 'opacity-60' : ''
              }`}
            >
              {/* Everything on one line: name and country, then points, count, and any tag. */}
              <div className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.name}
                  {c.country && <span className="ml-1 text-xs font-normal text-gray-500">{c.country}</span>}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{t.events.pts(Math.round(c.points))}</span>
                <span className="shrink-0 font-mono text-xs">{formatJudgeCount(c, categories)}</span>
                {c.playingIn && <span className="shrink-0 text-xs text-amber-700">{t.events.inPool(c.playingIn)}</span>}
              </div>
            </li>
          ))}
        </ul>
        {!loading && shown.total === 0 && <p className="text-sm text-gray-500">{t.events.noPlayersMatch}</p>}
        {shown.total > MAX_ROWS && (
          <p className="mt-2 text-xs text-gray-500">
            {t.events.showingTop(MAX_ROWS, shown.total)}
          </p>
        )}
      </div>
    </section>
  );
}
