'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelRoutine, setPlayingPool, setPlayingTeam, startRoutine } from '@/lib/head-judge-actions';
import { samePlayState, type PlayResponse, type PlayState } from '@/lib/head-judge-state';

// What the head judge did on this screen that the server may not have heard
// about yet. Kept in order and sent one at a time.
type Op =
  | { type: 'pool'; divisionId: string; roundNumber: number; letter: string }
  | { type: 'team'; teamId: string }
  | { type: 'start'; clickedAt: number }
  | { type: 'cancel' };

export type SaveStatus = 'saved' | 'saving' | 'retrying';

const POLL_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The change an operation makes to what's on screen.
function applyOp(state: PlayState, op: Op): PlayState {
  switch (op.type) {
    case 'pool':
      return {
        ...state,
        divisionId: op.divisionId,
        roundNumber: op.roundNumber,
        poolLetter: op.letter,
        teamId: null,
        routineStartedAt: null,
      };
    case 'team':
      return { ...state, teamId: op.teamId, routineStartedAt: null };
    case 'start':
      return { ...state, routineStartedAt: op.clickedAt };
    case 'cancel':
      return { ...state, routineStartedAt: null };
  }
}

// The Head Judge's play state. Every action shows on screen immediately (the
// routine timer starts the instant the button is pressed) and is saved in the
// background: one at a time, in order, retried until it lands, and kept in the
// browser meanwhile so a reload can't lose it. Other screens' changes come in
// by polling.
export function usePlayState(eventId: string, initial: PlayResponse) {
  const [state, setState] = useState<PlayState>(initial.state);
  // Server time minus this device's time, for the timer.
  const [clockOffset, setClockOffset] = useState(() => initial.serverNow - Date.now());
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [error, setError] = useState<string | null>(null);

  const queue = useRef<Op[]>([]);
  const draining = useRef(false);
  const offset = useRef(clockOffset);
  const storageKey = `head-judge-pending:${eventId}`;

  const persist = useCallback(() => {
    try {
      if (queue.current.length === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(queue.current));
    } catch {
      // Storage can be unavailable; saving still works, it just isn't kept across a reload.
    }
  }, [storageKey]);

  // Reads the server's state. It is only shown when nothing of ours is waiting
  // to be saved, so it can't undo what was just pressed.
  const poll = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const response = await fetch(`/api/head-judge/state?event=${encodeURIComponent(eventId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data: PlayResponse = await response.json();
      // The server read its clock about halfway through the round trip.
      offset.current = data.serverNow - (sentAt + Date.now()) / 2;
      setClockOffset(offset.current);
      setConnection('ok');
      if (queue.current.length === 0 && !draining.current) {
        setState((current) => (samePlayState(current, data.state) ? current : data.state));
      }
    } catch {
      setConnection('lost');
    }
  }, [eventId]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    let wait = 500;
    while (queue.current.length > 0) {
      const op = queue.current[0];
      setStatus(wait > 500 ? 'retrying' : 'saving');
      try {
        const result =
          op.type === 'pool'
            ? await setPlayingPool(eventId, op.divisionId, op.roundNumber, op.letter)
            : op.type === 'team'
              ? await setPlayingTeam(eventId, op.teamId)
              : op.type === 'start'
                ? await startRoutine(eventId, op.clickedAt)
                : await cancelRoutine(eventId);
        queue.current.shift();
        persist();
        wait = 500;
        if (result.error) {
          // The server refused it, so retrying can't help; the next read of the
          // server's state puts the screen right.
          setError(result.error);
        } else if (op.type === 'start') {
          // Normally the time we sent. If another screen started this routine
          // first, its earlier time wins.
          const startedAt = (result as { startedAt?: number }).startedAt;
          if (startedAt !== undefined) {
            setState((current) =>
              current.routineStartedAt !== null && current.routineStartedAt !== startedAt
                ? { ...current, routineStartedAt: startedAt }
                : current
            );
          }
        }
      } catch {
        // No answer (connection or server trouble): keep the operation and try again.
        setStatus('retrying');
        await sleep(wait);
        wait = Math.min(wait * 2, 5000);
      }
    }
    draining.current = false;
    setStatus('saved');
    void poll();
  }, [eventId, persist, poll]);

  const enqueue = useCallback(
    (op: Op) => {
      setError(null);
      setState((current) => applyOp(current, op));
      queue.current.push(op);
      persist();
      void drain();
    },
    [drain, persist]
  );

  // Restore anything a reload interrupted, then keep reading the server.
  useEffect(() => {
    const restore = setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        const ops: Op[] = saved ? JSON.parse(saved) : [];
        if (Array.isArray(ops) && ops.length > 0) {
          queue.current = ops;
          setState((current) => ops.reduce(applyOp, current));
          void drain();
        }
      } catch {
        // Nothing usable saved.
      }
      void poll();
    }, 0);

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(restore);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [storageKey, drain, poll]);

  return {
    state,
    clockOffset,
    status,
    connection,
    error,
    dismissError: () => setError(null),
    setPool: (divisionId: string, roundNumber: number, letter: string) =>
      enqueue({ type: 'pool', divisionId, roundNumber, letter }),
    setTeam: (teamId: string) => enqueue({ type: 'team', teamId }),
    // The click's time on the server's clock, so it counts from the press itself.
    start: () => enqueue({ type: 'start', clickedAt: Date.now() + offset.current }),
    cancel: () => enqueue({ type: 'cancel' }),
  };
}
