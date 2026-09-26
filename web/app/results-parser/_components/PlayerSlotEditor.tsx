'use client';

import { useState } from 'react';
import type { Slot } from '@/lib/results-parser/types';
import { PlayerPicker } from '@/app/events/_components/PlayerPicker';

const BADGE = {
  matched: 'bg-green-100 text-green-800',
  uncertain: 'bg-amber-100 text-amber-800',
  none: 'bg-red-100 text-red-800',
} as const;
const BADGE_LABEL = { matched: 'Matched', uncertain: 'Needs review', none: 'New player?' } as const;

export function PlayerSlotEditor({
  slot,
  onChange,
  onResolve,
  onRemove,
  createPlayer,
}: {
  slot: Slot;
  onChange: (slot: Slot) => void;
  // Picks a player for this written name in every slot that still lacks one.
  onResolve: (input: string | undefined, patch: Partial<Slot>) => void;
  onRemove: () => void;
  createPlayer: (name: string) => Promise<{ error: string | null; player?: { id: string; name: string } }>;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string) {
    setCreating(true);
    setError(null);
    const result = await createPlayer(name);
    setCreating(false);
    if (result.error || !result.player) {
      setError(result.error ?? 'Failed to create the player');
      return;
    }
    onResolve(slot.input, { id: result.player.id, name: result.player.name, created: true });
  }

  return (
    <div className="flex flex-col gap-1 border-l-2 border-gray-300 pl-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {slot.id ? (
          <>
            <span className="font-medium">{slot.name}</span>
            {slot.created && <span className={`rounded px-2 py-0.5 text-xs ${BADGE.matched}`}>Created</span>}
            {slot.input && !slot.created && slot.input !== slot.name && (
              <span className="text-xs text-gray-500">written as &ldquo;{slot.input}&rdquo;</span>
            )}
            <button
              type="button"
              onClick={() => onChange({ ...slot, id: null, name: '', created: false, status: slot.status === 'matched' ? 'uncertain' : slot.status })}
              className="text-xs text-blue-600 underline"
            >
              change
            </button>
          </>
        ) : (
          <>
            {slot.input ? <span className="font-medium">&ldquo;{slot.input}&rdquo;</span> : <span className="text-gray-500">No player picked</span>}
            {slot.status && <span className={`rounded px-2 py-0.5 text-xs ${BADGE[slot.status]}`}>{BADGE_LABEL[slot.status]}</span>}
          </>
        )}
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-600 underline">
          remove player
        </button>
      </div>

      {!slot.id && (
        <div className="flex flex-col gap-1">
          {slot.candidates && slot.candidates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {slot.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (slot.input ? onResolve(slot.input, { id: c.id, name: c.name }) : onChange({ ...slot, id: c.id, name: c.name }))}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                >
                  {c.name}
                  <span className="ml-1 text-gray-500">{[c.country, c.membership ? `FPA# ${c.membership}` : null].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <PlayerPicker
                onPick={(p) => (slot.input ? onResolve(slot.input, { id: p.id, name: p.name }) : onChange({ ...slot, id: p.id, name: p.name }))}
                placeholder="Search for a player…"
              />
            </div>
            {slot.input && (
              <button
                type="button"
                onClick={() => create(slot.input as string)}
                disabled={creating}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
              >
                {creating ? 'Creating…' : <>Create &ldquo;{slot.input}&rdquo; as new player</>}
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
