'use client';

import { POOL_LETTERS } from '@/lib/event-creator';
import { MAX_ROUND, newKey, roundName, type EditorRound } from '@/lib/results-parser/types';
import { nameKey } from '@/lib/roster-review';
import { PlayerSlotEditor } from './PlayerSlotEditor';

type Mutate = (fn: (draft: EditorRound[]) => void) => void;

const emptyTeam = (place: number) => ({ key: newKey(), place, players: [{ id: null, name: '' }, { id: null, name: '' }] });

export function RoundsEditor({
  rounds,
  mutate,
  createPlayer,
}: {
  rounds: EditorRound[];
  mutate: Mutate;
  createPlayer: (name: string) => Promise<{ error: string | null; player?: { id: string; name: string } }>;
}) {
  const nextRound = Array.from({ length: MAX_ROUND }, (_, i) => i + 1).find((n) => !rounds.some((r) => r.round === n));

  return (
    <div className="flex flex-col gap-4">
      {rounds.map((round, ri) => {
        const nextPool = POOL_LETTERS.find((l) => !round.pools.some((p) => p.letter === l));
        return (
          <section key={round.round} className="flex flex-col gap-3 rounded border border-gray-300 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-semibold">{roundName(round.round)}</h3>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove ${roundName(round.round)} and all its teams?`)) mutate((d) => void d.splice(ri, 1));
                }}
                className="ml-auto text-xs text-red-600 underline"
              >
                remove round
              </button>
            </div>

            {round.pools.map((pool, pi) => (
              <div key={pool.letter} className="flex flex-col gap-2 rounded bg-gray-50 p-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">Pool {pool.letter}</span>
                  <button
                    type="button"
                    onClick={() => mutate((d) => void d[ri].pools[pi].teams.sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity)))}
                    className="text-xs text-blue-600 underline"
                  >
                    sort by place
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pool.teams.length === 0 || window.confirm(`Remove Pool ${pool.letter} and its teams?`)) mutate((d) => void d[ri].pools.splice(pi, 1));
                    }}
                    className="ml-auto text-xs text-red-600 underline"
                  >
                    remove pool
                  </button>
                </div>

                {pool.teams.map((team, ti) => (
                  <div key={team.key} className="flex flex-col gap-2 rounded border border-gray-200 bg-white p-2 sm:flex-row">
                    <label className="flex items-center gap-2 text-sm sm:w-28 sm:flex-col sm:items-start">
                      <span className="text-xs text-gray-500">Place</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={team.place ?? ''}
                        onChange={(e) => {
                          const n = e.target.value === '' ? null : Number(e.target.value);
                          mutate((d) => void (d[ri].pools[pi].teams[ti].place = n));
                        }}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                    </label>
                    <div className="flex flex-1 flex-col gap-2">
                      {team.players.map((slot, si) => (
                        <PlayerSlotEditor
                          key={si}
                          slot={slot}
                          onChange={(next) => mutate((d) => void (d[ri].pools[pi].teams[ti].players[si] = next))}
                          onResolve={(input, patch) =>
                            mutate((d) => {
                              // The same written name still unresolved anywhere else gets the same player.
                              const key = nameKey(input ?? '');
                              for (const r of d) for (const p of r.pools) for (const t of p.teams) for (const s of t.players) {
                                if (!s.id && s.input && nameKey(s.input) === key) Object.assign(s, patch);
                              }
                            })
                          }
                          onRemove={() => mutate((d) => void d[ri].pools[pi].teams[ti].players.splice(si, 1))}
                          createPlayer={createPlayer}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => mutate((d) => void d[ri].pools[pi].teams[ti].players.push({ id: null, name: '' }))}
                        className="self-start text-xs text-blue-600 underline"
                      >
                        + add player
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => mutate((d) => void d[ri].pools[pi].teams.splice(ti, 1))}
                      className="self-start text-xs text-red-600 underline"
                    >
                      remove team
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => mutate((d) => void d[ri].pools[pi].teams.push(emptyTeam(d[ri].pools[pi].teams.length + 1)))}
                  className="self-start rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                >
                  + Add team
                </button>
              </div>
            ))}

            {nextPool && (
              <button
                type="button"
                onClick={() => mutate((d) => void d[ri].pools.push({ letter: nextPool, teams: [emptyTeam(1)] }))}
                className="self-start rounded border border-gray-300 px-2 py-1 text-xs"
              >
                + Add pool {nextPool}
              </button>
            )}
          </section>
        );
      })}

      {nextRound && (
        <button
          type="button"
          onClick={() =>
            mutate((d) => {
              d.push({ round: nextRound, pools: [{ letter: 'A', teams: [emptyTeam(1)] }] });
              d.sort((a, b) => a.round - b.round);
            })
          }
          className="self-start rounded border border-gray-300 px-3 py-2 text-sm"
        >
          + Add round ({roundName(nextRound)})
        </button>
      )}
    </div>
  );
}
