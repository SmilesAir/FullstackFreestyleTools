'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NoteCategory } from '@/lib/judging';
import type { JudgeNotesApi } from '@/app/judge/_components/useJudgeNotes';
import {
  addNote,
  canNote,
  currentRoutine,
  deleteNote,
  editNote,
  judgeState,
  newTestEvent,
  readTrainerState,
  submitBackup,
  submitScore,
  type TrainerState,
} from '@/lib/judging-trainer';

// The trainer's whole state, kept in this browser only.
const STORAGE_KEY = 'judging-trainer:v1';

export type TrainerUpdate = (change: (s: TrainerState) => TrainerState) => void;

// The trainer's state, read back from localStorage after a reload and saved on
// every change. Storage can be missing (a private window, blocked site data):
// the trainer still works, it just starts fresh next time.
export function useTrainerStore(): { state: TrainerState; loaded: boolean; update: TrainerUpdate } {
  const [state, setState] = useState<TrainerState>(newTestEvent);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Read after the first render, so the server's HTML and the browser's match.
    const restore = setTimeout(() => {
      try {
        const saved = readTrainerState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
        if (saved) setState(saved);
      } catch {
        // Nothing usable saved.
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: not kept across a reload.
    }
  }, [state, loaded]);

  return { state, loaded, update: setState };
}

// One judge's screen's notes from the trainer's state: the same shape the live
// useJudgeNotes hook gives the real screen, so the real screen can run on it.
// Saving is instant, so it is always saved and never retrying.
export function useTrainerJudge(state: TrainerState, update: TrainerUpdate, category: NoteCategory): JudgeNotesApi {
  // serverNow only sets the live hook's clock offset; here there is one clock.
  const js = useMemo(() => judgeState(state, category, 0), [state, category]);
  const noting = canNote(state, category);

  const note = useCallback(
    (noteType: string, position?: number, tappedAt: number = Date.now()) =>
      update((s) => addNote(s, category, noteType, tappedAt, Date.now(), position)),
    [update, category]
  );

  return {
    state: js,
    clockOffset: 0,
    status: 'saved',
    connection: 'ok',
    mode: 'local',
    paused: false,
    error: null,
    dismissError: () => {},
    canNote: noting,
    preStartNotes: [],
    submitting: false,
    submit: async (adjustPercent: number, routineId?: string | null) => {
      update((s) => submitScore(s, category, adjustPercent, routineId ?? s.currentRoutineId));
      return true;
    },
    submitBackup: async (adjustPercent: number, teamId: string) => {
      update((s) => submitBackup(s, category, teamId, adjustPercent, Date.now()));
      return true;
    },
    note,
    insertNote: (noteType: string, atSeconds: number, position?: number) =>
      update((s) => {
        const routine = currentRoutine(s);
        return routine ? addNote(s, category, noteType, routine.startedAt + atSeconds * 1000, Date.now(), position) : s;
      }),
    editNote: (noteId: string, rating: string, position: number) =>
      update((s) => editNote(s, category, noteId, rating, position)),
    removeNote: (noteId: string) => update((s) => deleteNote(s, category, noteId)),
    // The newest note of one type (the − button).
    removeLast: (noteType: string) => {
      const target = [...js.notes].reverse().find((n) => n.noteType === noteType);
      if (target && js.routineId !== null) update((s) => deleteNote(s, category, target.id));
    },
  };
}
