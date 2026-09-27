// The judging system's three categories. `type` is what pool_judges stores;
// `slug` is the page each category's judges use.
export const JUDGING_CATEGORIES = [
  { type: 'Diff', slug: 'difficulty', label: 'Difficulty' },
  { type: 'AI', slug: 'artistic-impression', label: 'Artistic Impression' },
  { type: 'Ex', slug: 'execution', label: 'Execution' },
] as const;

export type JudgingCategory = (typeof JUDGING_CATEGORIES)[number];

export const categoryByType = (type: string): JudgingCategory | undefined =>
  JUDGING_CATEGORIES.find((c) => c.type === type);

export const categoryBySlug = (slug: string): JudgingCategory | undefined =>
  JUDGING_CATEGORIES.find((c) => c.slug === slug);

export const judgePath = (category: JudgingCategory, eventId: string, playerId: string) =>
  `/judge/${category.slug}/${eventId}/${playerId}`;

// A seat: "the n-th judge of this category in whichever pool is playing" (from
// 1, judges in name order). A device can keep a seat's link open across pools;
// the screen switches to whoever holds the seat now.
export const seatPath = (category: JudgingCategory, eventId: string, seat: number) =>
  `/judge/${category.slug}/${eventId}/seat/${seat}`;

// Who holds a seat now (null = nobody: the pool has fewer judges of the category).
export type SeatHolder = { playerId: string; name: string } | null;

// Execution's notes, worst to best. Notes are saved by type only; what each is
// worth is a tunable setting (see judging-settings.ts).
export const EXECUTION_NOTES = [
  { type: 'large_error', label: 'Large Error' },
  { type: 'medium_error', label: 'Medium Error' },
  { type: 'minor_error', label: 'Minor Error' },
  { type: 'average_completion', label: 'Average Completion' },
  { type: 'clean_completion', label: 'Clean Completion' },
] as const;

export type ExecutionNoteType = (typeof EXECUTION_NOTES)[number]['type'];

// Artistic Impression's notes: three areas, each with its own levels, best
// first within each area (like Execution's buttons).
export const ARTISTIC_NOTES = [
  { type: 'teamwork_great', group: 'Teamwork', label: 'Great' },
  { type: 'teamwork_decent', group: 'Teamwork', label: 'Decent' },
  { type: 'teamwork_minor', group: 'Teamwork', label: 'Minor' },
  { type: 'music_great', group: 'Music', label: 'Great' },
  { type: 'music_decent', group: 'Music', label: 'Decent' },
  { type: 'form_good', group: 'Form', label: 'Good' },
  { type: 'form_bad', group: 'Form', label: 'Bad' },
] as const;

export type ArtisticNoteType = (typeof ARTISTIC_NOTES)[number]['type'];

// Difficulty's notes are ratings of a move the judge placed on a numberline:
// what each is worth is a multiplier of the numberline score (its setting).
export const DIFFICULTY_NOTES = [
  { type: 'good', label: 'Good' },
  { type: 'average', label: 'Average' },
  { type: 'bad', label: 'Bad' },
] as const;

export type DifficultyRating = (typeof DIFFICULTY_NOTES)[number]['type'];

export const isRating = (v: unknown): v is DifficultyRating => DIFFICULTY_NOTES.some((n) => n.type === v);

// The categories that take notes, and each one's notes in the order the judge's
// buttons list them (best first; Artistic Impression by area). `group`
// is the area heading, if the category has areas; `fullLabel` names a note where
// no heading is shown (the same level can appear in two areas). Difficulty's
// notes are not buttons: they are the ratings given to a move on the numberline.
export type NoteCategory = 'Ex' | 'AI' | 'Diff';
export type NoteDef = { type: string; label: string; fullLabel: string; group: string | null };

export const NOTE_CATEGORIES: readonly NoteCategory[] = ['Ex', 'AI', 'Diff'];

export const CATEGORY_NOTES: Record<NoteCategory, readonly NoteDef[]> = {
  Ex: [...EXECUTION_NOTES]
    .reverse()
    .map((n) => ({ type: n.type, label: n.label, fullLabel: n.label, group: null })),
  AI: ARTISTIC_NOTES.map((n) => ({ type: n.type, label: n.label, fullLabel: `${n.group} ${n.label}`, group: n.group })),
  Diff: DIFFICULTY_NOTES.map((n) => ({ type: n.type, label: n.label, fullLabel: n.label, group: null })),
};

export const noteCategoryOf = (categoryType: string): NoteCategory | null =>
  (NOTE_CATEGORIES as readonly string[]).includes(categoryType) ? (categoryType as NoteCategory) : null;

// A category's notes in consecutive groups (one group, with no heading, for
// Execution), for laying out the buttons under their area headings.
export function noteGroups(category: NoteCategory): { heading: string | null; notes: readonly NoteDef[] }[] {
  const groups: { heading: string | null; notes: NoteDef[] }[] = [];
  for (const note of CATEGORY_NOTES[category]) {
    const last = groups[groups.length - 1];
    if (last && last.heading === note.group) last.notes.push(note);
    else groups.push({ heading: note.group, notes: [note] });
  }
  return groups;
}

export const noteFullLabel = (category: NoteCategory, type: string): string =>
  CATEGORY_NOTES[category].find((n) => n.type === type)?.fullLabel ?? type;

// The note types each category accepts (by pool_judges category type).
export const NOTE_TYPES: Record<string, readonly string[]> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c, CATEGORY_NOTES[c].map((n) => n.type)])
);

export const noteTypesFor = (categoryType: string): readonly string[] | null =>
  Object.hasOwn(NOTE_TYPES, categoryType) ? NOTE_TYPES[categoryType] : null;

// Most notes one judge can save for one routine.
export const MAX_NOTES_PER_ROUTINE = 300;

// The judging system the live judge screens, notes and scores belong to: only
// divisions whose Rules are this take part.
export const JUDGING_RULES_ID = 'Fpa2027';

// The Difficulty judge's numberline: how long it is (the numberline score at
// its top; the bottom is 0) and the moves named on it. A move sits at a
// position from 0 to 1, so it stays where it is when the line's length changes.
export type DifficultyMove = { name: string; position: number };
export type DifficultyLine = { max: number; moves: DifficultyMove[] };

// A judge's submitted score for a routine.
export type SubmittedScore = { score: number; baseline: number; adjustPercent: number };

// What a judge's screen reads while it polls. Times are milliseconds since the
// epoch on the server's clock.
// A Difficulty note also has where it was tapped on the numberline (0 to 1), the
// numberline score that made (position x the line's length then) and the
// rating's multiplier then; its points are lineValue x multiplier.
export type JudgeNote = {
  id: string;
  noteType: string;
  notedAt: number;
  linePosition?: number;
  lineValue?: number;
  multiplier?: number;
};

// What a note is worth on the graph: the setting's weight for a note that is
// only a type, the numberline score times the multiplier for a Difficulty note.
export const notePoints = (
  note: { noteType: string; lineValue?: number | null; multiplier?: number | null },
  weights: Record<string, number>
): number =>
  note.lineValue != null && note.multiplier != null ? note.lineValue * note.multiplier : (weights[note.noteType] ?? 0);

export type JudgeState = {
  serverNow: number;
  // This person is judging this category in the event's playing pool right now.
  judging: boolean;
  poolTitle: string | null;
  teamName: string | null;
  // The running routine's first throw; null = none running.
  routineStartedAt: number | null;
  // The running routine's id (null = none running).
  routineId: string | null;
  // The routine the notes below belong to: the running one, otherwise this
  // judge's most recent.
  notesRoutine: { id: string; startedAt: number; teamName: string | null; routineSeconds: number } | null;
  // This judge's submitted score for that routine (null = not submitted).
  submitted: SubmittedScore | null;
  routineSeconds: number;
  notes: JudgeNote[];
  // What each of this category's notes is worth in the review graph: the event's
  // setting for the playing pool's judging system, with defaults filled in.
  noteWeights: Record<string, number>;
  // How the baseline estimate is made from the notes' curve (same source).
  estimate: { areaScale: number; power: number };
  // The numberline of a Difficulty judge (null for the other categories).
  line: DifficultyLine | null;
  // Which database answered: the screens ask every second from the local one.
  mode: 'local' | 'remote';
};

// What the other judges of one category made of a routine, averaged: the mean of
// their curves (each from their own notes) sampled every `step` seconds from the
// timer starting. Only the average is ever sent, never one judge's notes.
export type OtherCurve = { category: string; judges: number; step: number; ys: number[] };

// One routine a judge took notes on or scored, for the Review tab's list. The
// weights are the ones the score was submitted with, or the event's current
// ones if it wasn't submitted.
export type JudgedRoutine = {
  id: string;
  startedAt: number;
  teamName: string | null;
  poolTitle: string | null;
  routineSeconds: number;
  notes: JudgeNote[];
  submitted: SubmittedScore | null;
  noteWeights: Record<string, number>;
  estimate: { areaScale: number; power: number };
  // The other categories' judges, averaged per category.
  others: OtherCurve[];
};

// A team of the pool the judge is judging now that hasn't played yet (no
// routine that wasn't cancelled), drawn as an empty graph.
export type UpcomingTeam = { teamId: string; teamName: string | null; poolTitle: string; routineSeconds: number };

// The Review tab's list: the routines in the order they were played, then the
// rest of the judge's current pool in play order.
export type JudgeHistory = { routines: JudgedRoutine[]; upcoming: UpcomingTeam[] };

export type JudgingEvent = {
  eventId: string;
  eventName: string;
  // `seat` is the judge's place within their category (see seatPath).
  judges: { playerId: string; name: string; category: JudgingCategory; seat: number }[];
  // The event has a Simple Ranking division, so the landing page also offers
  // the anonymous "Judge" button to /judge/simple-ranking/<eventId>.
  simpleRanking: boolean;
};
