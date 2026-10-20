// The Judging Trainer: one made-up Fpa2027 pool played entirely in the browser.
// Nothing here touches the database; the state is plain data kept in
// localStorage, and everything the real screens read (a judge's state, the
// Review tab's list, the other judges' curves, the pool's results) is worked
// out from it with the same maths the server uses.

import type { HeadJudgePool, HeadJudgeTeam } from './head-judge';
import {
  combineTeamRoutines,
  judgeResultFromNotes,
  type JudgeResult,
  type PoolResultsData,
  type TeamResult,
} from './head-judge-results';
import {
  JUDGING_RULES_ID,
  NOTE_CATEGORIES,
  type JudgeHistory,
  type JudgeNote,
  type JudgeState,
  type JudgedRoutine,
  type NoteCategory,
  type OtherCurve,
  type SubmittedScore,
} from './judging';
import { averageRoutineCurves, type CurveNote } from './judging-curves';
import { adjustedScore, estimateFromNotes } from './judging-estimate';
import { defaultSettings, scoreLimitOf, type CategorySettings } from './judging-settings';
import { scoreLimit } from './score-curve';

export const TRAINER_ROUTINE_SECONDS = 180;
export const TRAINER_TEAM_COUNT = 8;
const PLAYERS_PER_TEAM = 2;

const POOL_TITLE = 'Trainer Open · Final · Pool A';
export const TRAINER_EVENT_ID = 'judging-trainer';

export const TRAINER_SETTINGS = defaultSettings(JUDGING_RULES_ID);

export const TRAINER_TEAMS: HeadJudgeTeam[] = Array.from({ length: TRAINER_TEAM_COUNT }, (_, i) => ({
  id: `team-${i + 1}`,
  players: Array.from({ length: PLAYERS_PER_TEAM }, (_, p) => `Team ${i + 1} Member ${p + 1}`),
  place: null,
}));

export const TRAINER_JUDGES: { playerId: string; name: string; categoryType: NoteCategory }[] = [
  { playerId: 'judge-diff', name: 'Diff Judge', categoryType: 'Diff' },
  { playerId: 'judge-ai', name: 'AI Judge', categoryType: 'AI' },
  { playerId: 'judge-ex', name: 'Ex Judge', categoryType: 'Ex' },
];

export const trainerJudge = (category: NoteCategory) => TRAINER_JUDGES.find((j) => j.categoryType === category)!;

const teamLabel = (team: HeadJudgeTeam) => team.players.join(' / ');

// The pool as the results screen reads it.
export const TRAINER_POOL: HeadJudgePool = {
  key: 'trainer:1:A',
  divisionId: 'trainer',
  divisionName: 'Trainer Open',
  roundNumber: 1,
  roundName: 'Final',
  letter: 'A',
  teams: TRAINER_TEAMS,
  judges: TRAINER_JUDGES,
  usesJudges: true,
  routineSeconds: TRAINER_ROUTINE_SECONDS,
  locked: false,
  resultsPublished: false,
};

// One run of a team's routine, started for one judge from the results table
// (each judge scores each team in a run of their own). `seconds` is its length:
// the full routine, or less if it was ended early.
export type TrainerRoutine = {
  id: string;
  teamId: string;
  category: NoteCategory | null;
  startedAt: number;
  seconds: number;
};

export type TrainerState = {
  version: 2;
  // Every routine played, oldest first.
  routines: TrainerRoutine[];
  // The routine on stage (running, or past its length waiting for the next
  // start): what the head judge's play state would point at. null = none.
  currentRoutineId: string | null;
  // Each routine's notes and submitted scores, per category.
  notes: Record<string, Partial<Record<NoteCategory, JudgeNote[]>>>;
  scores: Record<string, Partial<Record<NoteCategory, SubmittedScore>>>;
};

export const newTestEvent = (): TrainerState => ({
  version: 2,
  routines: [],
  currentRoutineId: null,
  notes: {},
  scores: {},
});

// A stored state, if it is one this version can read.
export function readTrainerState(value: unknown): TrainerState | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Partial<TrainerState>;
  if (s.version !== 2 || !Array.isArray(s.routines)) return null;
  if (typeof s.notes !== 'object' || s.notes === null || typeof s.scores !== 'object' || s.scores === null) return null;
  return s as TrainerState;
}

export const hasPlayed = (s: TrainerState) => s.routines.length > 0;

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const currentRoutine = (s: TrainerState): TrainerRoutine | null =>
  s.routines.find((r) => r.id === s.currentRoutineId) ?? null;

const teamOf = (teamId: string) => TRAINER_TEAMS.find((t) => t.id === teamId) ?? null;

// Whether the routine on stage is still running (inside its length; another
// routine can start, or it can be ended early, only then).
export const isInsideLength = (s: TrainerState, now: number) => {
  const r = currentRoutine(s);
  return r !== null && now - r.startedAt < r.seconds * 1000;
};

// Start a team's routine for one judge (from that judge's cell in the results
// table). Whatever was on stage comes off; its judge can still score it from Review.
export function startRoutine(s: TrainerState, teamId: string, category: NoteCategory, now: number): TrainerState {
  if (!teamOf(teamId)) return s;
  const routine: TrainerRoutine = { id: newId(), teamId, category, startedAt: now, seconds: TRAINER_ROUTINE_SECONDS };
  return { ...s, routines: [...s.routines, routine], currentRoutineId: routine.id };
}

// End the routine on stage now: its length becomes the time it ran, so the
// judge's Enter Score comes up straight away.
export function endEarly(s: TrainerState, now: number): TrainerState {
  const on = currentRoutine(s);
  if (!on || !isInsideLength(s, now)) return s;
  const seconds = Math.max(1, Math.floor((now - on.startedAt) / 1000));
  return { ...s, routines: s.routines.map((r) => (r.id === on.id ? { ...r, seconds } : r)) };
}

// A category's settings for one run. A run ended early keeps the full routine's
// limit of positive notes (as at an event, where the limit comes from the
// division's routine length, not from when it ended): its seconds per score
// shrink with it. Otherwise a run ended inside 15 seconds would count none.
function settingsFor(routine: TrainerRoutine | null, category: NoteCategory): CategorySettings {
  const own = TRAINER_SETTINGS[category];
  const perScore = scoreLimitOf(own);
  if (!routine || perScore <= 0 || routine.seconds >= TRAINER_ROUTINE_SECONDS) return own;
  const limit = scoreLimit(TRAINER_ROUTINE_SECONDS, perScore);
  // The half keeps floor(seconds / secondsPerScore) at the limit despite rounding.
  return { ...own, secondsPerScore: limit > 0 ? routine.seconds / (limit + 0.5) : perScore };
}

const notesOf = (s: TrainerState, routineId: string, category: NoteCategory): JudgeNote[] =>
  s.notes[routineId]?.[category] ?? [];

const withNotes = (s: TrainerState, routineId: string, category: NoteCategory, notes: JudgeNote[]): TrainerState => ({
  ...s,
  notes: { ...s.notes, [routineId]: { ...s.notes[routineId], [category]: [...notes].sort((a, b) => a.notedAt - b.notedAt) } },
});

// What a Difficulty note placed at `position` is worth (as the server stores it).
function difficultyPart(category: NoteCategory, rating: string, position: number | undefined) {
  if (category !== 'Diff' || position === undefined) return {};
  const line = TRAINER_SETTINGS.Diff.line!;
  return {
    linePosition: position,
    lineValue: Math.round(position * line.max * 10000) / 10000,
    multiplier: TRAINER_SETTINGS.Diff.noteWeights[rating] ?? 0,
  };
}

// Whether this category may still note the routine on stage (not once it has
// submitted its score for it).
export function canNote(s: TrainerState, category: NoteCategory): boolean {
  return s.currentRoutineId !== null && !s.scores[s.currentRoutineId]?.[category];
}

// A note on the routine on stage, at `at` (kept between its start and now, as the server does).
export function addNote(
  s: TrainerState,
  category: NoteCategory,
  noteType: string,
  at: number,
  now: number,
  position?: number
): TrainerState {
  const routine = currentRoutine(s);
  if (!routine || !canNote(s, category)) return s;
  const notedAt = Math.min(Math.max(at, routine.startedAt), now);
  const note: JudgeNote = { id: newId(), noteType, notedAt, ...difficultyPart(category, noteType, position) };
  return withNotes(s, routine.id, category, [...notesOf(s, routine.id, category), note]);
}

export function editNote(s: TrainerState, category: NoteCategory, noteId: string, rating: string, position: number): TrainerState {
  const routine = currentRoutine(s);
  if (!routine || !canNote(s, category)) return s;
  const notes = notesOf(s, routine.id, category).map((n) =>
    n.id === noteId ? { id: n.id, notedAt: n.notedAt, noteType: rating, ...difficultyPart(category, rating, position) } : n
  );
  return withNotes(s, routine.id, category, notes);
}

export function deleteNote(s: TrainerState, category: NoteCategory, noteId: string): TrainerState {
  const routine = currentRoutine(s);
  if (!routine || !canNote(s, category)) return s;
  return withNotes(s, routine.id, category, notesOf(s, routine.id, category).filter((n) => n.id !== noteId));
}

// The judge's score for a routine (the one on stage unless given): the
// baseline from the notes, changed by the judge's percent - the server's sum.
export function submitScore(
  s: TrainerState,
  category: NoteCategory,
  adjustPercent: number,
  routineId: string | null = s.currentRoutineId
): TrainerState {
  const routine = s.routines.find((r) => r.id === routineId);
  if (!routine) return s;
  const percent = Math.round(adjustPercent * 100) / 100;
  const stored = s.scores[routine.id]?.[category];
  const own = settingsFor(routine, category);
  // An earlier routine's score keeps its baseline: only the change is new.
  const baseline =
    routine.id !== s.currentRoutineId && stored
      ? stored.baseline
      : Math.round(
      estimateFromNotes(
        notesOf(s, routine.id, category),
        routine.startedAt,
        routine.seconds,
        own.noteWeights,
        own.estimate,
        category,
        scoreLimitOf(own)
      ).baseline * 100
    ) / 100;
  const score: SubmittedScore = { score: adjustedScore(baseline, percent), baseline, adjustPercent: percent };
  return { ...s, scores: { ...s.scores, [routine.id]: { ...s.scores[routine.id], [category]: score } } };
}

// The backup score for a team with no routine: one is made for it (or the one
// another judge's backup made is used), then scored.
export function submitBackup(
  s: TrainerState,
  category: NoteCategory,
  teamId: string,
  adjustPercent: number,
  now: number
): TrainerState {
  let next = s;
  let routine = s.routines.find((r) => r.teamId === teamId);
  if (!routine) {
    routine = { id: newId(), teamId, category: null, startedAt: now, seconds: TRAINER_ROUTINE_SECONDS };
    next = { ...s, routines: [...s.routines, routine] };
  }
  return submitScore(next, category, adjustPercent, routine.id);
}

// Every note of a routine in these categories, as the curve maths reads them.
function curveNotes(s: TrainerState, routineId: string, categories: readonly NoteCategory[]): CurveNote[] {
  return categories.flatMap((category) =>
    notesOf(s, routineId, category).map((n) => ({
      playerId: trainerJudge(category).playerId,
      categoryType: category,
      noteType: n.noteType,
      notedAt: n.notedAt,
      lineValue: n.lineValue ?? null,
      multiplier: n.multiplier ?? null,
    }))
  );
}

function routineCurves(s: TrainerState, routine: TrainerRoutine, categories: readonly NoteCategory[]): OtherCurve[] {
  return averageRoutineCurves(
    { startedAt: routine.startedAt, routineSeconds: routine.seconds },
    curveNotes(s, routine.id, categories),
    TRAINER_SETTINGS,
    categories
  );
}

// The other categories' judges, averaged, for one routine.
export function otherCurves(s: TrainerState, category: NoteCategory, routineId: string | null): OtherCurve[] {
  const routine = s.routines.find((r) => r.id === routineId);
  if (!routine) return [];
  return routineCurves(
    s,
    routine,
    NOTE_CATEGORIES.filter((c) => c !== category)
  );
}

const judged = (s: TrainerState, routineId: string, category: NoteCategory) =>
  notesOf(s, routineId, category).length > 0 || !!s.scores[routineId]?.[category];

// What a judge's screen reads, as /api/judge/state would answer it.
export function judgeState(s: TrainerState, category: NoteCategory, now: number): JudgeState {
  const on = currentRoutine(s);
  // The routine the notes belong to: the one on stage, otherwise this judge's most recent.
  const notesFor = on ?? [...s.routines].reverse().find((r) => judged(s, r.id, category)) ?? null;
  const notesTeam = notesFor ? teamOf(notesFor.teamId) : null;
  const onTeam = on ? teamOf(on.teamId) : null;
  const own = settingsFor(on ?? notesFor, category);
  return {
    serverNow: now,
    judging: true,
    poolTitle: POOL_TITLE,
    teamName: onTeam ? teamLabel(onTeam) : null,
    routineStartedAt: on?.startedAt ?? null,
    routineId: on?.id ?? null,
    notesRoutine: notesFor
      ? {
          id: notesFor.id,
          startedAt: notesFor.startedAt,
          teamName: notesTeam ? teamLabel(notesTeam) : null,
          routineSeconds: notesFor.seconds,
        }
      : null,
    submitted: notesFor ? (s.scores[notesFor.id]?.[category] ?? null) : null,
    routineSeconds: on?.seconds ?? notesFor?.seconds ?? TRAINER_ROUTINE_SECONDS,
    notes: notesFor ? notesOf(s, notesFor.id, category) : [],
    noteWeights: own.noteWeights,
    estimate: own.estimate,
    secondsPerScore: scoreLimitOf(own),
    line: own.line ?? null,
    mode: 'local',
  };
}

// The Review tab's list, as /api/judge/history would answer it: each team that
// played once, then the teams still to play.
export function judgeHistory(s: TrainerState, category: NoteCategory): JudgeHistory {
  // Each team is run once per judge here, so a judge's own run (on stage for
  // them, then one they noted or scored) comes before another judge's run.
  const rank = (r: TrainerRoutine) =>
    r.id === s.currentRoutineId && r.category === category
      ? 3
      : judged(s, r.id, category)
        ? 2
        : r.id === s.currentRoutineId
          ? 1
          : 0;
  const chosen = new Map<string, TrainerRoutine>();
  for (const r of s.routines) {
    const kept = chosen.get(r.teamId);
    if (!kept || rank(r) >= rank(kept)) chosen.set(r.teamId, r);
  }
  const routines: JudgedRoutine[] = [...chosen.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((r) => {
      const team = teamOf(r.teamId);
      const own = settingsFor(r, category);
      return {
        id: r.id,
        startedAt: r.startedAt,
        teamName: team ? teamLabel(team) : null,
        poolTitle: POOL_TITLE,
        routineSeconds: r.seconds,
        notes: notesOf(s, r.id, category),
        submitted: s.scores[r.id]?.[category] ?? null,
        noteWeights: own.noteWeights,
        estimate: own.estimate,
        secondsPerScore: scoreLimitOf(own),
        others: otherCurves(s, category, r.id),
      };
    });
  const upcoming = TRAINER_TEAMS.filter((t) => !chosen.has(t.id)).map((t) => ({
    teamId: t.id,
    teamName: teamLabel(t),
    poolTitle: POOL_TITLE,
    routineSeconds: TRAINER_ROUTINE_SECONDS,
  }));
  return { routines, upcoming };
}

// The pool's results, as /api/head-judge/results would answer them.
export function poolResults(s: TrainerState): PoolResultsData {
  const byTeam = new Map<string, TeamResult[]>();
  for (const r of s.routines) {
    const judges: Record<string, JudgeResult> = {};
    for (const category of NOTE_CATEGORIES) {
      const notes = notesOf(s, r.id, category);
      const submitted = s.scores[r.id]?.[category] ?? null;
      if (notes.length === 0 && !submitted) continue;
      judges[trainerJudge(category).playerId] = judgeResultFromNotes(
        notes,
        { startedAt: r.startedAt, routineSeconds: r.seconds },
        settingsFor(r, category),
        category,
        submitted
      );
    }
    const entry: TeamResult = { routineId: r.id, judges, curves: routineCurves(s, r, NOTE_CATEGORIES) };
    byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), entry]);
  }
  const data: PoolResultsData = {};
  for (const [teamId, routines] of byTeam) {
    const combined = combineTeamRoutines(routines);
    if (combined) data[teamId] = combined;
  }
  return data;
}
