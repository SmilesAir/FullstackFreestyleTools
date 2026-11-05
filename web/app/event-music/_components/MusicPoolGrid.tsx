'use client';

import { DIVISION_NAMES } from '@/lib/event-creator';
import type { HeadJudgeDivision } from '@/lib/head-judge';
import type { TeamSongs } from '@/lib/event-music';
import { useT } from '@/lib/i18n/client';

// The event's pools as buttons, laid out like the Head Judge's Results tab (one
// column per division, one row per round), each saying how many of its teams
// have no song. The pool the Head Judge is playing is marked.
export function MusicPoolGrid({
  divisions,
  songs,
  selectedKey,
  playingKey,
  onSelect,
}: {
  divisions: HeadJudgeDivision[];
  songs: TeamSongs;
  selectedKey: string | null;
  playingKey: string | null;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  const withPools = divisions.filter((d) => d.rounds.length > 0);
  if (withPools.length === 0) return <p className="text-sm text-gray-500">{t.eventMusic.noPoolsYet}</p>;

  // The standard divisions this event has, in their usual order, then any others.
  const standard = DIVISION_NAMES.flatMap((name) => withPools.filter((d) => d.name === name));
  const others = withPools.filter((d) => !(DIVISION_NAMES as readonly string[]).includes(d.name));
  const columns = [...standard, ...others];

  // Rounds that any division has, in playing order (earliest round first).
  const rounds = [...new Set(withPools.flatMap((d) => d.rounds).map((r) => r.number))]
    .map((number) => ({ number, name: t.common.roundName(number) }))
    .sort((a, b) => b.number - a.number);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max gap-x-6 gap-y-3"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(9rem, 1fr))` }}
      >
        {columns.map((division) => (
          <h3 key={division.id} className="border-b border-gray-300 pb-1 font-semibold">
            {division.name}
          </h3>
        ))}
        {rounds.map((round) =>
          columns.map((division) => {
            const pools = division.rounds.find((r) => r.number === round.number)?.pools ?? [];
            return (
              <div key={`${round.number}:${division.id}`} className="flex flex-col gap-1">
                {pools.length === 0 ? (
                  <span className="text-gray-300">—</span>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">{round.name}</span>
                    <div className="flex flex-wrap gap-2">
                      {pools.map((p) => {
                        const missing = p.teams.filter((t) => !songs[t.id]).length;
                        const selected = selectedKey === p.key;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => onSelect(p.key)}
                            aria-pressed={selected}
                            className={`flex cursor-pointer flex-col items-start rounded border px-3 py-1.5 text-left ${
                              selected ? 'border-black bg-black text-white' : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 font-medium">
                              {t.common.pool(p.letter)}
                              {p.key === playingKey && (
                                <span className="rounded bg-green-600 px-1.5 text-xs font-semibold text-white">{t.eventMusic.playing}</span>
                              )}
                            </span>
                            <span
                              className={`text-xs ${
                                missing === 0
                                  ? selected
                                    ? 'text-green-300'
                                    : 'text-green-700'
                                  : selected
                                    ? 'text-amber-300'
                                    : 'text-amber-700'
                              }`}
                            >
                              {missing === 0 ? t.eventMusic.allSongs : t.eventMusic.missing(missing, p.teams.length)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
