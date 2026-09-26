'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  cancelRoutine,
  finishRoutine,
  restoreRoutine,
  setPlayingPool,
  setPlayingTeam,
  startRoutine,
} from '@/lib/head-judge-actions';
import { fetchJson } from '@/lib/fetch-json';
import { samePlayState, type PlayResponse, type PlayState } from '@/lib/head-judge-state';
import { HEAD_JUDGE_POLL_MS, type PollMode } from '@/lib/poll-intervals';

// What the head judge did on this screen that the server may not have heard
// about yet. Kept in order and sent one at a time.
type Op =
  | { type: 'pool'; divisionId: string; roundNumber: number; letter: string }
  | { type: 'team'; teamId: string }
  | { type: 'start'; clickedAt: number }
  | { type: 'cancel' }
  | { type: 'next'; nextTeamId: string | null }
  | { type: 'restore'; routineId: string };

export type SaveStatus = 'saved' | 'saving' | 'retrying';

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
        finishedJudges: [],
        restorableRoutineId: null,
      };
    // Whether there is a routine to restore is only known once the server is read.
    case 'team':
      return { ...state, teamId: op.teamId, routineStartedAt: null, finishedJudges: [], restorableRoutineId: null };
    case 'start':
      return { ...state, routineStartedAt: op.clickedAt, finishedJudges: [], restorableRoutineId: null };
    case 'cancel':
      return { ...state, routineStartedAt: null, finishedJudges: [] };
    // The routine is over as played; the next team (if any) is up.
    case 'next':
      return { ...state, teamId: op.nextTeamId, routineStartedAt: null, finishedJudges: [], restorableRoutineId: null };
    case 'restore':
      return { ...state, restorableRoutineId: null };
  }
}

// The Head Judge's play state. Every action shows on screen immediately (the
// routine timer starts the instant the button is pressed) and is saved in the
// background: one at a time, in order, retried until it lands, and kept in the
// browser meanwhile so a reload can't lose it. Other screens' changes come in
// by polling, which also tells when the event's pools, teams or judges were
// changed elsewhere (the Event Creator): the page's data is then read again.
export function usePlayState(eventId: string, initial: PlayResponse) {
  const [state, setState] = useState<PlayState>(initial.state);
  // Server time minus this device's time, for the timer.
  const [clockOffset, setClockOffset] = useState(() => initial.serverNow - Date.now());
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [error, setError] = useState<string | null>(null);
  // Which judges' screens have been heard from lately (seconds ago, by player id).
  const [presence, setPresence] = useState<Record<string, number>>(initial.presence);
  // Which database answers: the local one is asked every second, Neon less often.
  const [mode, setMode] = useState<PollMode>(initial.mode);
  const modeRef = useRef<PollMode>(initial.mode);
  const polling = useRef(false);

  const router = useRouter();
  // The fingerprint of the event's structure the page on screen was drawn with.
  const structureKey = useRef(initial.structureKey);
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
    // A slow answer never has a second request stacked on it.
    if (polling.current) return;
    polling.current = true;
    const sentAt = Date.now();
    try {
      const data = await fetchJson<PlayResponse>(`/api/head-judge/state?event=${encodeURIComponent(eventId)}`);
      // The server read its clock about halfway through the round trip.
      offset.current = data.serverNow - (sentAt + Date.now()) / 2;
      setClockOffset(offset.current);
      setConnection('ok');
      modeRef.current = data.mode ?? 'remote';
      setMode(modeRef.current);
      setPresence(data.presence ?? {});
      // Changed elsewhere: read the page's data again (once per change).
      if (data.structureKey && data.structureKey !== structureKey.current) {
        structureKey.current = data.structureKey;
        router.refresh();
      }
      if (queue.current.length === 0 && !draining.current) {
        setState((current) => (samePlayState(current, data.state) ? current : data.state));
      }
    } catch {
      setConnection('lost');
    } finally {
      polling.current = false;
    }
  }, [eventId, router]);

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
                : op.type === 'restore'
                  ? await restoreRoutine(eventId, op.routineId)
                  : op.type === 'next'
                    ? await finishRoutine(eventId, op.nextTeamId)
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

    // Ask again a poll interval after the last answer arrived (the interval
    // follows the database that answered).
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      if (document.visibilityState === 'visible') await poll();
      if (!stopped) timer = setTimeout(loop, HEAD_JUDGE_POLL_MS[modeRef.current]);
    };
    timer = setTimeout(loop, HEAD_JUDGE_POLL_MS[modeRef.current]);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(restore);
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [storageKey, drain, poll]);

  return {
    state,
    clockOffset,
    status,
    connection,
    presence,
    mode,
    error,
    dismissError: () => setError(null),
    setPool: (divisionId: string, roundNumber: number, letter: string) =>
      enqueue({ type: 'pool', divisionId, roundNumber, letter }),
    setTeam: (teamId: string) => enqueue({ type: 'team', teamId }),
    // The click's time on the server's clock, so it counts from the press itself.
    start: () => enqueue({ type: 'start', clickedAt: Date.now() + offset.current }),
    cancel: () => enqueue({ type: 'cancel' }),
    // Ends the running routine as played and puts the next team up (null = none).
    nextTeam: (nextTeamId: string | null) => enqueue({ type: 'next', nextTeamId }),
    restore: (routineId: string) => enqueue({ type: 'restore', routineId }),
  };
}
