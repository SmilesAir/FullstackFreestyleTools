'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { startIdlePoller } from '@/lib/idle-poller';
import type { JudgeState, NoteCategory, SeatHolder } from '@/lib/judging';
import { fetchJson } from '@/lib/fetch-json';
import { JUDGE_POLL_MS, type PollMode } from '@/lib/poll-intervals';
import { IDLE_MS } from './useJudgeNotes';
import { NotesJudge } from './NotesJudge';

type Holder = { playerId: string; name: string; initial: JudgeState };

// A judging seat's screen (see seatPath): the screen of whoever holds the seat
// now. It keeps asking who that is, and when the pool changes it switches to the
// new judge by itself, so a device can be set up once and left on the seat. It
// only switches once everything pressed for the old judge has been saved.
export function SeatJudge({
  category,
  categoryLabel,
  eventId,
  seat,
  basePath,
  initialTab,
  initial,
}: {
  category: NoteCategory;
  categoryLabel: string;
  eventId: string;
  seat: number;
  basePath: string;
  initialTab: string;
  initial: Holder | null;
}) {
  // `shown` is the judge on screen; `next` the one to switch to once the shown
  // one's presses are all saved (undefined = no switch waiting; null = the seat
  // is now empty).
  const [seatState, setSeatState] = useState<{ shown: Holder | null; next: Holder | null | undefined }>({
    shown: initial,
    next: undefined,
  });
  const { shown: holder, next } = seatState;
  const [saved, setSaved] = useState(true);

  // Switch once nothing of the old judge's is still on its way.
  if (next !== undefined && (saved || holder === null)) {
    setSeatState({ shown: next, next: undefined });
    setSaved(true);
  }

  // The poll compares against these, so it doesn't need to restart on a switch.
  const holderId = useRef(initial?.playerId ?? null);
  const nextId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    holderId.current = holder?.playerId ?? null;
    nextId.current = next === undefined ? undefined : (next?.playerId ?? null);
  });

  // Which database answers: the local server is asked every second.
  const seatMode = useRef<PollMode>('remote');
  const poll = useCallback(async () => {
    try {
      const query = new URLSearchParams({ event: eventId, category, seat: String(seat) });
      const body = await fetchJson<{ holder: SeatHolder; mode?: PollMode }>(`/api/judge/seat?${query}`);
      const now = body.holder;
      seatMode.current = body.mode ?? 'remote';
      const id = now?.playerId ?? null;
      if (id === holderId.current) {
        // Back to the judge already shown: nothing to switch.
        if (nextId.current !== undefined) setSeatState((s) => ({ ...s, next: undefined }));
        return;
      }
      if (id === nextId.current) return;
      if (now === null) {
        setSeatState((s) => ({ ...s, next: null }));
        return;
      }
      // The new judge's screen starts from their own state.
      const stateQuery = new URLSearchParams({ event: eventId, player: now.playerId, category });
      const state = await fetchJson<JudgeState>(`/api/judge/state?${stateQuery}`);
      setSeatState((s) => ({ ...s, next: { ...now, initial: state } }));
    } catch {
      // No connection: the current screen says so; ask again next time.
    }
  }, [eventId, category, seat]);

  useEffect(() => {
    const first = setTimeout(() => void poll(), 0);
    const stop = startIdlePoller({ poll: () => void poll(), pollMs: () => JUDGE_POLL_MS[seatMode.current], idleMs: IDLE_MS, onPausedChange: () => {} });
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [poll]);

  if (!holder) {
    return (
      <main className="mx-auto mt-24 max-w-sm px-4 text-center">
        <h1 className="mb-2 text-xl font-semibold">
          {categoryLabel} seat {seat}
        </h1>
        <p className="text-sm text-gray-500">
          Nobody is in this seat in the pool that is playing. Keep this screen open: it switches to the judge as soon as
          the head judge sets a pool with one.
        </p>
      </main>
    );
  }

  return (
    <NotesJudge
      // A new judge gets a fresh screen: their own notes, saving and tabs.
      key={holder.playerId}
      category={category}
      eventId={eventId}
      playerId={holder.playerId}
      judgeName={holder.name}
      basePath={basePath}
      initialTab={initialTab}
      initial={holder.initial}
      onSaveStatus={setSaved}
    />
  );
}
