'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addNote, deleteNote, editNote, submitBackupScore, submitScore } from '@/lib/judging-actions';
import { fetchJson } from '@/lib/fetch-json';
import { startIdlePoller } from '@/lib/idle-poller';
import type { JudgeNote, JudgeState } from '@/lib/judging';
import { JUDGE_POLL_MS, type PollMode } from '@/lib/poll-intervals';

export type SaveStatus = 'saved' | 'saving' | 'retrying';

export const IDLE_MS = 10 * 60 * 1000;

// What the judge did on this screen that the server may not have heard about
// yet. Kept in order and sent one at a time.
type Op =
  | { type: 'add'; id: string; noteType: string; clickedAt: number; routineId: string; position?: number }
  | { type: 'edit'; id: string; noteType: string; position: number }
  | { type: 'delete'; id: string };

// A note tapped before this judge's poll has confirmed the real routine id -
// closing the gap between the head judge starting a routine and this judge's
// screen learning about it (JUDGE_POLL_MS.remote is 5s). Kept locally, shown
// at once, and attached to the real routine (with its original tap time) once
// the next poll resolves it - see the effect near the bottom of the hook.
type PreStartNote = { id: string; noteType: string; clickedAt: number; position?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// crypto.randomUUID only exists on secure pages; getRandomValues works on any.
function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// A Difficulty note as the screen shows it before the server has made it: the
// numberline score and multiplier from the settings the screen has (the server
// works out its own, the same unless the settings just changed).
function difficultyPart(server: JudgeState, rating: string, position: number) {
  return server.line
    ? {
        linePosition: position,
        lineValue: Math.round(position * server.line.max * 10000) / 10000,
        multiplier: server.noteWeights[rating] ?? 0,
      }
    : {};
}

// The server's notes with what is still waiting to be sent laid on top.
function withPending(server: JudgeState, ops: Op[]): JudgeNote[] {
  let notes = server.notes;
  for (const op of ops) {
    if (op.type === 'add') {
      if (server.routineId === op.routineId && !notes.some((n) => n.id === op.id)) {
        notes = [
          ...notes,
          {
            id: op.id,
            noteType: op.noteType,
            notedAt: op.clickedAt,
            ...(op.position === undefined ? {} : difficultyPart(server, op.noteType, op.position)),
          },
        ];
      }
    } else if (op.type === 'edit') {
      notes = notes.map((n) =>
        n.id === op.id ? { id: n.id, notedAt: n.notedAt, noteType: op.noteType, ...difficultyPart(server, op.noteType, op.position) } : n
      );
    } else {
      notes = notes.filter((n) => n.id !== op.id);
    }
  }
  return notes === server.notes ? notes : [...notes].sort((a, b) => a.notedAt - b.notedAt);
}

// A judge's live notes. A press shows on screen at once and is saved in the
// background: one at a time, in order, retried until it lands, and kept in the
// browser meanwhile so a reload can't lose it. The server's state (routine,
// team, saved notes) comes in by polling (every 5 s, every second from the
// local server: see JUDGE_POLL_MS), which stops after
// IDLE_MS without a touch and starts again on the next one. Saving never stops.
export function useJudgeNotes(eventId: string, playerId: string, categoryType: string, initial: JudgeState) {
  const [server, setServer] = useState<JudgeState>(initial);
  const [ops, setOps] = useState<Op[]>([]);
  // Saved, but not yet in a read of the server's state: still shown, so a note
  // doesn't vanish between being saved and the next read.
  const [settled, setSettled] = useState<Op[]>([]);
  // Notes tapped before the real routine id is known (see PreStartNote above).
  const [preStart, setPreStart] = useState<PreStartNote[]>([]);
  const preStartRef = useRef<PreStartNote[]>([]);
  // The routine id a buffer was already flushed for, so a routine that stays
  // current across several polls doesn't get flushed into more than once.
  const flushedFor = useRef<string | null>(null);
  const [clockOffset, setClockOffset] = useState(() => initial.serverNow - Date.now());
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Which database answers: the local server is asked every second.
  const [mode, setMode] = useState<PollMode>(initial.mode);
  const modeRef = useRef<PollMode>(initial.mode);
  const reading = useRef(false);

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
      const data = await fetchJson<JudgeState>(`/api/judge/state?${query}`);
      // The server read its clock about halfway through the round trip.
      offset.current = data.serverNow - (sentAt + Date.now()) / 2;
      setClockOffset(offset.current);
      setConnection('ok');
      modeRef.current = data.mode ?? 'remote';
      setMode(modeRef.current);
      if (sentAt >= lastSavedAt.current) {
        // This read started after everything saved so far, so it includes it.
        setServer(data);
        setSettled([]);
      }
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
            ? await addNote(eventId, playerId, categoryType, op.id, op.noteType, op.clickedAt, op.routineId, op.position)
            : op.type === 'edit'
              ? await editNote(eventId, playerId, op.id, op.noteType, op.position)
              : await deleteNote(eventId, playerId, categoryType, op.id);
        queue.current.shift();
        lastSavedAt.current = Date.now();
        sync();
        wait = 500;
        // A refusal can't be fixed by retrying; the next read puts the screen right.
        if (result.error) setError(result.error);
        else setSettled((current) => [...current, op]);
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
      // A read still under way is left to finish rather than stacking another.
      poll: () => {
        if (reading.current) return;
        reading.current = true;
        void poll().finally(() => {
          reading.current = false;
        });
      },
      pollMs: () => JUDGE_POLL_MS[modeRef.current],
      idleMs: IDLE_MS,
      onPausedChange: setPaused,
    });
    return () => {
      clearTimeout(restore);
      stopPolling();
    };
  }, [storageKey, drain, poll]);

  const notes = useMemo(() => withPending(server, [...settled, ...ops]), [server, settled, ops]);
  const state = useMemo(() => ({ ...server, notes }), [server, notes]);
  const preStartNotes = useMemo<JudgeNote[]>(
    () =>
      preStart.map((p) => ({
        id: p.id,
        noteType: p.noteType,
        notedAt: p.clickedAt,
        ...(p.position === undefined ? {} : difficultyPart(server, p.noteType, p.position)),
      })),
    [preStart, server]
  );

  // Notes are locked once the judge has submitted their score for the routine.
  const submittedHere = server.submitted !== null && server.notesRoutine?.id === server.routineId;
  // True once this judge may note: a routine is confirmed running, or (to
  // close the gap before this judge's own poll learns of it) a team is up and
  // about to start - those taps are buffered in preStart until the real
  // routine id resolves (see the effect below), not sent early.
  const canNote = server.judging && !submittedHere && (server.routineId !== null || server.teamName !== null);

  // Reconciles the pre-start buffer against the server's play state: once a
  // routine id appears, attach every buffered tap to it (with its original
  // tap time - the server clamps anything before the real start, same as any
  // other late-arriving note); if the team comes off instead (the head judge
  // backed out before starting), there is nothing to attach them to.
  useEffect(() => {
    if (server.routineId !== null) {
      if (preStartRef.current.length === 0 || flushedFor.current === server.routineId) return;
      flushedFor.current = server.routineId;
      const toFlush = preStartRef.current;
      preStartRef.current = [];
      setPreStart([]);
      for (const p of toFlush) {
        enqueue({ type: 'add', id: p.id, noteType: p.noteType, clickedAt: p.clickedAt, routineId: server.routineId, position: p.position });
      }
    } else if (server.teamName === null && preStartRef.current.length > 0) {
      preStartRef.current = [];
      setPreStart([]);
    }
  }, [server.routineId, server.teamName, enqueue]);

  // Submits the judge's score for the running routine (or, given `routineId`, an
  // earlier one whose score is being changed): the server works out the baseline
  // from the saved notes and applies the change in percent. Notes still being
  // sent are saved first so they count. Returns whether it was saved.
  const submit = async (adjustPercent: number, routineId: string | null = server.routineId): Promise<boolean> => {
    if (routineId === null || submitting) return false;
    setError(null);
    setSubmitting(true);
    try {
      for (let waited = 0; queue.current.length > 0 || draining.current; waited += 200) {
        if (waited >= 15000) {
          setError('Your notes are still saving. Try again in a moment.');
          return false;
        }
        await sleep(200);
      }
      const result = await submitScore(eventId, playerId, categoryType, routineId, adjustPercent);
      if (result.error) {
        setError(result.error);
        return false;
      }
      await poll();
      return true;
    } catch {
      setError('Could not submit. Check the connection and try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // The backup for a team of the pool that has no routine: the server makes one
  // (or uses the one another judge made) and saves the score. Returns whether
  // it was saved.
  const submitBackup = async (adjustPercent: number, teamId: string): Promise<boolean> => {
    if (submitting) return false;
    setError(null);
    setSubmitting(true);
    try {
      const result = await submitBackupScore(eventId, playerId, categoryType, teamId, adjustPercent);
      if (result.error) {
        setError(result.error);
        return false;
      }
      await poll();
      return true;
    } catch {
      setError('Could not submit. Check the connection and try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    state,
    clockOffset,
    status,
    connection,
    mode,
    paused,
    error,
    dismissError: () => setError(null),
    canNote,
    preStartNotes,
    submit,
    submitBackup,
    submitting,
    // Saves a note as of this moment on the server's clock. A Difficulty note is
    // the rating (`noteType`) of a move placed at `position` on the numberline,
    // and is as of the tap that placed it (`tappedAt`, on this device's clock).
    // While the real routine id isn't known yet (canNote is true because a team
    // is up, about to start), the note is buffered in preStart instead of sent -
    // the effect above attaches it once the id resolves.
    note: (noteType: string, position?: number, tappedAt: number = Date.now()) => {
      if (!canNote) return;
      const clickedAt = Math.round(tappedAt + offset.current);
      if (server.routineId !== null) {
        enqueue({ type: 'add', id: newId(), noteType, clickedAt, routineId: server.routineId, position });
        return;
      }
      const next = [...preStartRef.current, { id: newId(), noteType, clickedAt, position }];
      preStartRef.current = next;
      setPreStart(next);
    },
    // Saves a note as of `atSeconds` into the running routine (editing a
    // routine after the fact). The server keeps it between the start and now.
    insertNote: (noteType: string, atSeconds: number, position?: number) => {
      if (!canNote || server.routineId === null || server.routineStartedAt === null) return;
      enqueue({
        type: 'add',
        id: newId(),
        noteType,
        clickedAt: Math.round(server.routineStartedAt + atSeconds * 1000),
        routineId: server.routineId,
        position,
      });
    },
    // Changes a Difficulty note's rating and where it sits on the numberline.
    // A still-buffered pre-start note is changed in place (the server has
    // never seen it); anything else goes through the usual queue.
    editNote: (noteId: string, rating: string, position: number) => {
      if (!canNote) return;
      const idx = preStartRef.current.findIndex((p) => p.id === noteId);
      if (idx !== -1) {
        const next = [...preStartRef.current];
        next[idx] = { ...next[idx], noteType: rating, position };
        preStartRef.current = next;
        setPreStart(next);
        return;
      }
      enqueue({ type: 'edit', id: noteId, noteType: rating, position });
    },
    // Removes one particular note (picked on the score graph). A still-buffered
    // pre-start note is just dropped locally, not sent as a delete (the server
    // has never seen it, and it will never be flushed once it's gone).
    removeNote: (noteId: string) => {
      if (!canNote) return;
      if (preStartRef.current.some((p) => p.id === noteId)) {
        const next = preStartRef.current.filter((p) => p.id !== noteId);
        preStartRef.current = next;
        setPreStart(next);
        return;
      }
      enqueue({ type: 'delete', id: noteId });
    },
    // Removes the newest note of one type (the decrement button) - a buffered
    // pre-start note first (it's the one actually shown while a routine isn't
    // confirmed running yet; see NotesPlay's `running ? state.notes :
    // preStartNotes`), otherwise the newest sent one.
    removeLast: (noteType: string) => {
      const pending = [...preStartRef.current].reverse().find((p) => p.noteType === noteType);
      if (pending) {
        const next = preStartRef.current.filter((p) => p.id !== pending.id);
        preStartRef.current = next;
        setPreStart(next);
        return;
      }
      const target = [...notes].reverse().find((n) => n.noteType === noteType);
      if (target) enqueue({ type: 'delete', id: target.id });
    },
  };
}
