'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DIVISION_NAMES } from '@/lib/event-creator';
import { navigateToPool } from '@/lib/public-results-actions';
import type { DivisionNavEntry } from '@/lib/public-results';

// An event's pools as buttons, laid out like the Head Judge's Results tab: one
// column per division and one row per round, so the same round lines up
// across divisions. A button opens that pool's public results page.
export function PoolGrid({ divisions }: { divisions: DivisionNavEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withPools = divisions.filter((d) => d.rounds.length > 0);
  if (withPools.length === 0) return <p className="text-sm text-gray-500">No pools set up yet.</p>;

  // The standard divisions this event has, in their usual order, then any others.
  const standard = DIVISION_NAMES.flatMap((name) => withPools.filter((d) => d.name === name));
  const others = withPools.filter((d) => !(DIVISION_NAMES as readonly string[]).includes(d.name));
  const columns = [...standard, ...others];

  // Rounds that any division has, in playing order (earliest round first).
  const rounds = [...new Map(withPools.flatMap((d) => d.rounds).map((r) => [r.number, r.name])).entries()]
    .map(([number, name]) => ({ number, name }))
    .sort((a, b) => b.number - a.number);

  function open(divisionId: string, roundNumber: number, letter: string) {
    const key = `${divisionId}:${roundNumber}:${letter}`;
    setError(null);
    setOpening(key);
    startTransition(async () => {
      const { code } = await navigateToPool(divisionId, roundNumber, letter);
      if (!code) {
        setError('Could not open that pool.');
        setOpening(null);
        return;
      }
      router.push(`/r/${code}`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div
          className="grid min-w-max gap-x-6 gap-y-3"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(8rem, 1fr))` }}
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
                          const key = `${division.id}:${round.number}:${p.letter}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={pending}
                              onClick={() => open(division.id, round.number, p.letter)}
                              className={`cursor-pointer rounded border px-4 py-2 disabled:cursor-default ${
                                opening === key ? 'border-black bg-black text-white' : 'border-gray-300 hover:bg-gray-50 disabled:opacity-50'
                              }`}
                            >
                              Pool {p.letter}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
