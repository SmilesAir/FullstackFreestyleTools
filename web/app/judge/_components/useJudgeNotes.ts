'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addNote, deleteNote } from '@/lib/judging-actions';
import { startIdlePoller } from '@/lib/idle-poller';
import type { JudgeNote, JudgeState } from '@/lib/judging';

export type SaveStatus = 'saved' | 'saving' | 'retrying';

export const POLL_MS = 5000;
export const IDLE_MS = 10 * 60 * 1000;

// What the judge did on this screen that the server may not have heard about
// yet. Kept in order and sent one at a time.
type Op =
  | { type: 'add'; id: string; noteType: string; clickedAt: number; routineStartedAt: number }
  | { type: 'delete'; id: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// crypto.randomUUID only exists on secure pages; getRandomValues works on any.
function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The server's notes with what is still waiting to be sent laid on top.
function withPending(server: JudgeState, ops: Op[]): JudgeNote[] {
  let notes = server.notes;
  for (const op of ops) {
    if (op.type === 'add') {
      if (server.routineStartedAt === op.routineStartedAt && !notes.some((n) => n.id === op.id)) {
        notes = [...notes, { id: op.id, noteType: op.noteType, notedAt: op.clickedAt }];
      }
    } else {
      notes = notes.filter((n) => n.id !== op.id);
    }
  }
  return notes === server.notes ? notes : [...notes].sort((a, b) => a.notedAt - b.notedAt);
}

// A judge's live notes. A press shows on screen at once and is saved in the
// background: one at a time, in order, retried until it lands, and kept in the
// browser meanwhile so a reload can't lose it. The server's state (routine,
// team, saved notes) comes in by polling every POLL_MS, which stops after
// IDLE_MS without a touch and starts again on the next one. Saving never stops.
export function useJudgeNotes(eventId: string, playerId: string, categoryType: string, initial: JudgeState) {
  const [server, setServer] = useState<JudgeState>(initial);
  const [ops, setOps] = useState<Op[]>([]);
  const [clockOffset, setClockOffset] = useState(() => initial.serverNow - Date.now());
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queue = useRef<Op[]>([]);
  const draining = useRef(false);
  const offset = useRef(clockOffset);
  // A read that started before the last save finished may not include it.
  const lastSavedAt = useRef(0);
  const storageKey = `judge-pending:${eventId}:${playerId}:${categoryType}`;

  const sync = useCallback(() => {
    setOps([...queue.current]);
    try {
      if (queue.current.length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(queue.current));
    } catch {
      // Storage can be unavailable; saving still works, it just isn't kept across a reload.
    }
  }, [storageKey]);

  const poll = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const query = new URLSearchParams({ event: eventId, player: playerId, category: categoryType });
      const response = await fetch(`/api/judge/state?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data: JudgeState = await response.json();
      // The server read its clock about halfway through the round trip.
      offset.current = data.serverNow - (sentAt + Date.now()) / 2;
      setClockOffset(offset.current);
      setConnection('ok');
      if (sentAt >= lastSavedAt.current) setServer(data);
    } catch {
      setConnection('lost');
    }
  }, [eventId, playerId, categoryType]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    let wait = 500;
    while (queue.current.length > 0) {
      const op = queue.current[0];
      setStatus(wait > 500 ? 'retrying' : 'saving');
      try {
        const result =
          op.type === 'add'
            ? await addNote(eventId, playerId, categoryType, op.id, op.noteType, op.clickedAt, op.routineStartedAt)
            : await deleteNote(eventId, playerId, categoryType, op.id);
        queue.current.shift();
        lastSavedAt.current = Date.now();
        sync();
        wait = 500;
        // A refusal can't be fixed by retrying; the next read puts the screen right.
        if (result.error) setError(result.error);
      } catch {
        // No answer (connection or server trouble): keep the note and try again.
        setStatus('retrying');
        await sleep(wait);
        wait = Math.min(wait * 2, 5000);
      }
    }
    draining.current = false;
    setStatus('saved');
    void poll();
  }, [eventId, playerId, categoryType, sync, poll]);

  const enqueue = useCallback(
    (op: Op) => {
      setError(null);
      queue.current.push(op);
      sync();
      void drain();
    },
    [drain, sync]
  );

  useEffect(() => {
    // Restore anything a reload interrupted, then start reading.
    const restore = setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        const restored: Op[] = saved ? JSON.parse(saved) : [];
        if (Array.isArray(restored) && restored.length > 0) {
          queue.current = restored;
          setOps([...restored]);
          void drain();
        }
      } catch {
        // Nothing usable saved.
      }
      void poll();
    }, 0);

    const stopPolling = startIdlePoller({
      poll: () => void poll(),
      pollMs: POLL_MS,
      idleMs: IDLE_MS,
      onPausedChange: setPaused,
    });
    return () => {
      clearTimeout(restore);
      stopPolling();
    };
  }, [storageKey, drain, poll]);

  const notes = useMemo(() => withPending(server, ops), [server, ops]);
  const state = useMemo(() => ({ ...server, notes }), [server, notes]);

  const canNote = server.judging && server.routineStartedAt !== null;

  return {
    state,
    clockOffset,
    status,
    connection,
    paused,
    error,
    dismissError: () => setError(null),
    canNote,
    // Saves a note as of this moment on the server's clock.
    note: (noteType: string) => {
      if (!canNote || server.routineStartedAt === null) return;
      enqueue({
        type: 'add',
        id: newId(),
        noteType,
        clickedAt: Math.round(Date.now() + offset.current),
        routineStartedAt: server.routineStartedAt,
      });
    },
    // Removes the newest note.
    undoLast: () => {
      const last = notes[notes.length - 1];
      if (last) enqueue({ type: 'delete', id: last.id });
    },
  };
}
