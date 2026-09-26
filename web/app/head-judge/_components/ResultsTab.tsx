'use client';

import { DIVISION_NAMES } from '@/lib/event-creator';
import { flattenPools, poolTitle, type HeadJudgeDivision } from '@/lib/head-judge';
import { PoolResults } from './PoolResults';

// One column per division and one row per round, so the same round lines up
// across divisions; a round's pools are buttons side by side in its cell.
// Clicking a pool shows its results underneath.
export function ResultsTab({
  eventId,
  active,
  divisions,
  selectedKey,
  onSelect,
}: {
  eventId: string;
  // This tab is showing, so the results are read live.
  active: boolean;
  divisions: HeadJudgeDivision[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const withPools = divisions.filter((d) => d.rounds.length > 0);
  if (withPools.length === 0) {
    return <p className="text-sm text-gray-500">No pools with teams yet. Set them up in the Event Creator.</p>;
  }

  // The four standard divisions always get a column (so they stay put); any
  // other division the event has follows them.
  const standard = DIVISION_NAMES.map((name) => ({ name, division: withPools.find((d) => d.name === name) ?? null }));
  const others = withPools.filter((d) => !(DIVISION_NAMES as readonly string[]).includes(d.name));
  const columns = [...standard, ...others.map((division) => ({ name: division.name, division }))];

  // Rounds that any division has, in playing order (earliest round first).
  const rounds = [...new Map(withPools.flatMap((d) => d.rounds).map((r) => [r.number, r.name])).entries()]
    .map(([number, name]) => ({ number, name }))
    .sort((a, b) => b.number - a.number);

  const selected = flattenPools(withPools).find((p) => p.key === selectedKey) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-x-6 gap-y-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((column) => (
          <h2 key={column.name} className="border-b border-gray-300 pb-1 text-lg font-semibold">
            {column.name}
          </h2>
        ))}
        {rounds.map((round) =>
          columns.map(({ name, division }) => {
            const pools = division?.rounds.find((r) => r.number === round.number)?.pools ?? [];
            return (
              <div key={`${round.number}:${name}`} className="flex flex-col gap-1">
                {pools.length === 0 ? (
                  <span className="text-gray-300">—</span>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">{round.name}</span>
                    <div className="flex flex-wrap gap-2">
                      {pools.map((pool) => (
                        <button
                          key={pool.key}
                          type="button"
                          onClick={() => onSelect(pool.key)}
                          aria-pressed={pool.key === selectedKey}
                          className={`cursor-pointer rounded border px-4 py-2 text-base ${
                            pool.key === selectedKey ? 'border-black bg-black text-white' : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Pool {pool.letter}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {selected ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{poolTitle(selected)}</h2>
          <PoolResults key={selected.key} eventId={eventId} pool={selected} active={active} />
        </section>
      ) : (
        <p className="text-sm text-gray-500">Choose a pool to see its results.</p>
      )}
    </div>
  );
}
