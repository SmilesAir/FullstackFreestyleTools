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

// Execution's notes, worst to best. `value` is only what the review graph draws:
// the overview document doesn't define points yet, so these are provisional and
// nothing stores them (notes are saved by type).
export const EXECUTION_NOTES = [
  { type: 'large_error', label: 'Large Error', value: -3 },
  { type: 'medium_error', label: 'Medium Error', value: -2 },
  { type: 'minor_error', label: 'Minor Error', value: -1 },
  { type: 'average_completion', label: 'Average Completion', value: 1 },
  { type: 'clean_completion', label: 'Clean Completion', value: 2 },
] as const;

export type ExecutionNoteType = (typeof EXECUTION_NOTES)[number]['type'];

// The note types each category accepts (by pool_judges category type).
export const NOTE_TYPES: Record<string, readonly string[]> = {
  Ex: EXECUTION_NOTES.map((n) => n.type),
};

export const noteTypesFor = (categoryType: string): readonly string[] | null =>
  Object.hasOwn(NOTE_TYPES, categoryType) ? NOTE_TYPES[categoryType] : null;

// Most notes one judge can save for one routine.
export const MAX_NOTES_PER_ROUTINE = 300;

// What a judge's screen reads while it polls. Times are milliseconds since the
// epoch on the server's clock.
export type JudgeNote = { id: string; noteType: string; notedAt: number };

export type JudgeState = {
  serverNow: number;
  // This person is judging this category in the event's playing pool right now.
  judging: boolean;
  poolTitle: string | null;
  teamName: string | null;
  // The running routine's first throw; null = none running.
  routineStartedAt: number | null;
  // The routine the notes below belong to: the running one, otherwise this
  // judge's most recent.
  notesRoutine: { startedAt: number; teamName: string | null; routineSeconds: number } | null;
  routineSeconds: number;
  notes: JudgeNote[];
};

export type JudgingEvent = {
  eventId: string;
  eventName: string;
  judges: { playerId: string; name: string; category: JudgingCategory }[];
};
