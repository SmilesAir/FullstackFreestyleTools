'use client';

import type { Slot } from '@/lib/roster-review';
import { quickCreatePlayer } from '@/lib/event-creator-actions';
import { PlayerPicker } from '../PlayerPicker';

const BADGE = {
  matched: 'bg-green-100 text-green-800',
  uncertain: 'bg-amber-100 text-amber-800',
  none: 'bg-red-100 text-red-800',
} as const;
const BADGE_LABEL = { matched: 'Matched', uncertain: 'Needs review', none: 'New player?' } as const;

export function TeamsReview({
  teams,
  update,
  resolve,
  onError,
}: {
  teams: Slot[][];
  // Applies a change to these teams (the parent owns the state).
  update: (change: (prev: Slot[][]) => Slot[][]) => void;
  // Picks a player for a written name everywhere that name is still unresolved.
  resolve: (input: string, patch: Partial<Slot>) => void;
  onError: (message: string | null) => void;
}) {
  function updateSlot(t: number, s: number, patch: Partial<Slot>) {
    update((prev) => prev.map((team, ti) => (ti !== t ? team : team.map((slot, si) => (si !== s ? slot : { ...slot, ...patch })))));
  }

  async function createPlayer(t: number, s: number, name: string) {
    const result = await quickCreatePlayer(name);
    if (result.error || !result.player) {
      onError(result.error ?? 'Failed to create player');
      return;
    }
    onError(null);
    resolve(name, { selectedId: result.player.id, selectedName: result.player.name, created: true });
  }

  return (
    <>
      {teams.map((team, t) => (
        <div key={t} className="flex flex-col gap-2 rounded bg-gray-50 p-2">
          <div className="text-xs text-gray-500">Team {t + 1}</div>
          {team.map((slot, s) => (
            <div key={s} className="flex flex-col gap-1 border-l-2 border-gray-300 pl-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">&ldquo;{slot.input}&rdquo;</span>
                <span className={`rounded px-2 py-0.5 text-xs ${slot.created ? BADGE.matched : BADGE[slot.status]}`}>
                  {slot.created ? 'Created' : BADGE_LABEL[slot.status]}
                </span>
                {slot.selectedName && <span className="text-gray-700">→ {slot.selectedName}</span>}
                {slot.selectedId && (
                  <button type="button" onClick={() => updateSlot(t, s, { selectedId: null, selectedName: null, created: false })} className="text-xs text-red-600 underline">
                    clear
                  </button>
                )}
              </div>
              {!slot.selectedId && (
                <div className="flex flex-col gap-1">
                  {slot.candidates.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {slot.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => resolve(slot.input, { selectedId: c.id, selectedName: c.name })}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                        >
                          {c.name}
                          <span className="ml-1 text-gray-500">{[c.country, c.membership ? `FPA# ${c.membership}` : null].filter(Boolean).join(' · ')}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-64">
                      <PlayerPicker
                        onPick={(p) => resolve(slot.input, { selectedId: p.id, selectedName: p.name })}
                        placeholder="Search for a different player…"
                      />
                    </div>
                    <button type="button" onClick={() => createPlayer(t, s, slot.input)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">
                      Create &ldquo;{slot.input}&rdquo; as new player
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
