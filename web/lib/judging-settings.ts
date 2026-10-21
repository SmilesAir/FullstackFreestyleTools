// The head judge's tunables for a judging system (a division's rules id).
// Stored per event as { "<rules id>": { "<category>": { ... } } } and copied
// to and from named presets. Anything missing or invalid reads as its default,
// so a screen can never break on a bad stored value.

import type { RulesId } from './event-creator';
import {
  CATEGORY_NOTES,
  NOTE_CATEGORIES,
  noteCategoryOf,
  type DifficultyLine,
  type NoteCategory,
} from './judging';

// How the baseline estimate is made from the area under the notes' curve:
// estimate = areaScale x area (heights raised to `power`, see score-curve.ts).
export type EstimateSettings = { areaScale: number; power: number };

// One category's tunables: what each of its notes is worth (for Difficulty, the
// multiplier of each rating), and its estimate. Difficulty also has its
// numberline: how long it is and the moves named on it. Execution and
// Difficulty also limit how many positive notes count toward the baseline: one
// per `secondsPerScore` of the routine (0 = no limit; see score-curve.ts).
export type CategorySettings = {
  noteWeights: Record<string, number>;
  estimate: EstimateSettings;
  line?: DifficultyLine;
  secondsPerScore?: number;
};

// One system's settings, all categories that take notes.
export type SystemSettings = Record<NoteCategory, CategorySettings>;

// A named copy of one system's settings. `eventId` is the event it is the event
// preset of (null = shared across events).
export type Preset = { id: string; rulesId: string; name: string; settings: SystemSettings; eventId: string | null };

// The preset a new event's settings are copied from.
export const OFFICIAL_PRESET = 'Fpa-Official';

export const MIN_WEIGHT = -100;
export const MAX_WEIGHT = 100;
export const WEIGHT_STEP = 0.5;

// Difficulty's ratings are multipliers of the numberline score, so never negative.
export const MIN_MULTIPLIER = 0;
export const MAX_MULTIPLIER = 10;
export const MULTIPLIER_STEP = 0.05;

// What a note's weight may be, and the step to change it by, for a category.
export const weightRange = (category: NoteCategory): [number, number] =>
  category === 'Diff' ? [MIN_MULTIPLIER, MAX_MULTIPLIER] : [MIN_WEIGHT, MAX_WEIGHT];
export const weightStep = (category: NoteCategory): number => (category === 'Diff' ? MULTIPLIER_STEP : WEIGHT_STEP);

// The numberline: its length (the numberline score at the top), how many moves
// can be named on it, and how long a name can be. A move's position is 0 to 1.
export const MIN_LINE_MAX = 0.1;
export const MAX_LINE_MAX = 1000;
export const LINE_MAX_STEP = 0.1;
export const MAX_MOVES = 30;
export const MAX_MOVE_NAME = 40;
export const POSITION_STEP = 0.01;

export const MIN_AREA_SCALE = 0;
export const MAX_AREA_SCALE = 100;
export const AREA_SCALE_STEP = 0.05;
export const MIN_POWER = 0.5;
export const MAX_POWER = 3;
export const POWER_STEP = 0.1;

export const MIN_SECONDS_PER_SCORE = 0;
export const MAX_SECONDS_PER_SCORE = 600;
export const SECONDS_PER_SCORE_STEP = 1;

// The categories with a limit of positive notes.
export const hasScoreLimit = (category: NoteCategory): boolean => category === 'Ex' || category === 'Diff';

// A category's seconds per counted positive note (0 = no limit).
export const scoreLimitOf = (settings: CategorySettings | undefined): number => settings?.secondsPerScore ?? 0;

// 15 seconds per score: 4 positive notes a minute.
const DEFAULT_SECONDS_PER_SCORE = 15;

// Power 1 is the plain area: no extra credit for clusters until it is raised.
const DEFAULT_ESTIMATE: EstimateSettings = { areaScale: 1, power: 1 };

// The document gives no note values, so these are placeholders to tune.
const DEFAULT_WEIGHTS: Record<NoteCategory, Record<string, number>> = {
  Ex: {
    large_error: -3,
    medium_error: -2,
    minor_error: -1,
    average_completion: 1,
    clean_completion: 2,
  },
  AI: {
    teamwork_minor: 1,
    teamwork_decent: 2,
    teamwork_great: 3,
    music_decent: 1,
    music_great: 2,
    form_bad: -1,
    form_good: 1,
  },
  Diff: { bad: 0.3, average: 1, good: 2 },
};

// Three moves to start, at 0.2, 0.5 and 0.8 of the way up (on a line of 10 that is
// Chair 2, Gitis 5, Double Barrell Gitis 8).
const DEFAULT_LINE: DifficultyLine = {
  max: 3,
  moves: [
    { name: 'Chair', position: 0.2 },
    { name: 'Gitis', position: 0.5 },
    { name: 'Double Barrell Gitis', position: 0.8 },
  ],
};

const DEFAULT_SYSTEM: SystemSettings = {
  Ex: { noteWeights: DEFAULT_WEIGHTS.Ex, estimate: DEFAULT_ESTIMATE, secondsPerScore: DEFAULT_SECONDS_PER_SCORE },
  AI: { noteWeights: DEFAULT_WEIGHTS.AI, estimate: DEFAULT_ESTIMATE },
  Diff: {
    noteWeights: DEFAULT_WEIGHTS.Diff,
    estimate: DEFAULT_ESTIMATE,
    line: DEFAULT_LINE,
    secondsPerScore: DEFAULT_SECONDS_PER_SCORE,
  },
};

// The systems that have tunables, with their defaults. Each is free to differ
// from the others; Fpa2020 and Fpa2027 start out equal.
const SYSTEM_DEFAULTS: Partial<Record<RulesId, SystemSettings>> = {
  Fpa2020: DEFAULT_SYSTEM,
  Fpa2027: DEFAULT_SYSTEM,
};

export const TUNABLE_SYSTEMS = Object.keys(SYSTEM_DEFAULTS) as RulesId[];

export const hasTunables = (rulesId: string): rulesId is RulesId => Object.hasOwn(SYSTEM_DEFAULTS, rulesId);

const cloneLine = (line: DifficultyLine): DifficultyLine => ({ max: line.max, moves: line.moves.map((m) => ({ ...m })) });

const clone = (s: SystemSettings): SystemSettings =>
  Object.fromEntries(
    NOTE_CATEGORIES.map((c) => [
      c,
      {
        noteWeights: { ...s[c].noteWeights },
        estimate: { ...s[c].estimate },
        ...(s[c].line ? { line: cloneLine(s[c].line) } : {}),
        ...(s[c].secondsPerScore !== undefined ? { secondsPerScore: s[c].secondsPerScore } : {}),
      },
    ])
  ) as SystemSettings;

// A system without tunables of its own reads the Fpa2020 defaults.
export function defaultSettings(rulesId: string): SystemSettings {
  return clone(hasTunables(rulesId) ? SYSTEM_DEFAULTS[rulesId]! : DEFAULT_SYSTEM);
}

// The settings of the category a judge judges (undefined for a category without notes).
export function categorySettings(settings: SystemSettings, categoryType: string): CategorySettings | undefined {
  const category = noteCategoryOf(categoryType);
  return category ? settings[category] : undefined;
}

// What a Difficulty note is made of under Difficulty's settings: the numberline
// score (the position x the line's length) and the rating's multiplier.
export function difficultyNoteValues(
  diff: CategorySettings,
  rating: string,
  position: number
): { lineValue: number; multiplier: number } {
  return {
    lineValue: Math.round(position * diff.line!.max * 10000) / 10000,
    multiplier: diff.noteWeights[rating],
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const validWeight = (category: NoteCategory, v: unknown): v is number => inRange(v, ...weightRange(category));
const validLineMax = (v: unknown): v is number => inRange(v, MIN_LINE_MAX, MAX_LINE_MAX);
const validPosition = (v: unknown): v is number => inRange(v, 0, 1);
const validMoveName = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= MAX_MOVE_NAME;
const validAreaScale = (v: unknown): v is number => inRange(v, MIN_AREA_SCALE, MAX_AREA_SCALE);
const validPower = (v: unknown): v is number => inRange(v, MIN_POWER, MAX_POWER);
const validSecondsPerScore = (v: unknown): v is number => inRange(v, MIN_SECONDS_PER_SCORE, MAX_SECONDS_PER_SCORE);

// One system's stored settings over its defaults; invalid entries are ignored.
export function resolveSettings(rulesId: string, stored: unknown): SystemSettings {
  const settings = defaultSettings(rulesId);
  for (const category of NOTE_CATEGORIES) {
    const part = isObject(stored) && isObject(stored[category]) ? stored[category] : {};
    const weights = isObject(part.noteWeights) ? part.noteWeights : {};
    for (const note of CATEGORY_NOTES[category]) {
      const value = Object.hasOwn(weights, note.type) ? weights[note.type] : undefined;
      if (validWeight(category, value)) settings[category].noteWeights[note.type] = value;
    }
    const estimate = isObject(part.estimate) ? part.estimate : {};
    if (validAreaScale(estimate.areaScale)) settings[category].estimate.areaScale = estimate.areaScale;
    if (validPower(estimate.power)) settings[category].estimate.power = estimate.power;
    if (hasScoreLimit(category) && validSecondsPerScore(part.secondsPerScore)) {
      settings[category].secondsPerScore = part.secondsPerScore;
    }

    const line = settings[category].line;
    if (line && isObject(part.line)) {
      if (validLineMax(part.line.max)) line.max = part.line.max;
      // A stored list of moves replaces the default one (bad entries are dropped).
      if (Array.isArray(part.line.moves)) {
        line.moves = part.line.moves
          .filter((m): m is Record<string, unknown> => isObject(m) && validMoveName(m.name) && validPosition(m.position))
          .slice(0, MAX_MOVES)
          .map((m) => ({ name: String(m.name).trim(), position: Number(m.position) }));
      }
    }
  }
  return settings;
}

// The part of an event's stored blob that belongs to one system.
export function resolveEventSettings(rulesId: string, eventBlob: unknown): SystemSettings {
  const stored = isObject(eventBlob) && Object.hasOwn(eventBlob, rulesId) ? eventBlob[rulesId] : undefined;
  return resolveSettings(rulesId, stored);
}

// The settings of one category from a score's stored snapshot ({ rulesId,
// <category>: settings }), or null if it isn't one. A score made before the
// limit of positive notes existed has none stored: it is shown with
// `currentSecondsPerScore` (the event's limit now), so its results still say
// which notes are over the limit; its stored baseline is unchanged.
export function snapshotCategorySettings(
  snapshot: unknown,
  categoryType: string,
  currentSecondsPerScore: number
): CategorySettings | undefined | null {
  if (!isObject(snapshot) || typeof snapshot.rulesId !== 'string') return null;
  const own = categorySettings(resolveSettings(snapshot.rulesId, snapshot), categoryType);
  const stored = snapshot[categoryType];
  if (own && own.secondsPerScore !== undefined && !(isObject(stored) && stored.secondsPerScore !== undefined)) {
    return { ...own, secondsPerScore: currentSecondsPerScore };
  }
  return own;
}

// For saving: every value of every category must be present and valid, and
// nothing unknown is allowed. Values are rounded to 2 decimals.
export function validateSettings(rulesId: string, input: unknown): { error: string } | { settings: SystemSettings } {
  if (!hasTunables(rulesId)) return { error: 'That judging system has no settings to save' };
  const unreadable = { error: 'The settings could not be read' };
  if (!isObject(input) || Object.keys(input).some((k) => !noteCategoryOf(k))) return unreadable;

  const settings = defaultSettings(rulesId);
  for (const category of NOTE_CATEGORIES) {
    const part = input[category];
    if (!isObject(part) || !isObject(part.noteWeights) || !isObject(part.estimate)) return unreadable;
    if (Object.keys(part).some((k) => !['noteWeights', 'estimate', 'line', 'secondsPerScore'].includes(k))) return unreadable;
    if ((category === 'Diff') !== (part.line !== undefined)) return unreadable;
    if (hasScoreLimit(category) !== (part.secondsPerScore !== undefined)) return unreadable;
    const known = new Set(CATEGORY_NOTES[category].map((n) => n.type));
    if (Object.keys(part.noteWeights).some((k) => !known.has(k))) return unreadable;
    if (Object.keys(part.estimate).some((k) => k !== 'areaScale' && k !== 'power')) return unreadable;

    for (const note of CATEGORY_NOTES[category]) {
      const value = Object.hasOwn(part.noteWeights, note.type) ? part.noteWeights[note.type] : undefined;
      if (!validWeight(category, value)) {
        const [min, max] = weightRange(category);
        return { error: `${note.fullLabel} must be a number from ${min} to ${max}` };
      }
      settings[category].noteWeights[note.type] = Math.round(value * 100) / 100;
    }
    if (!validAreaScale(part.estimate.areaScale)) {
      return { error: `The area coefficient must be a number from ${MIN_AREA_SCALE} to ${MAX_AREA_SCALE}` };
    }
    if (!validPower(part.estimate.power)) {
      return { error: `The cluster power must be a number from ${MIN_POWER} to ${MAX_POWER}` };
    }
    settings[category].estimate.areaScale = Math.round(part.estimate.areaScale * 100) / 100;
    settings[category].estimate.power = Math.round(part.estimate.power * 100) / 100;
    if (hasScoreLimit(category)) {
      if (!validSecondsPerScore(part.secondsPerScore)) {
        return {
          error: `The seconds per score must be a number from ${MIN_SECONDS_PER_SCORE} to ${MAX_SECONDS_PER_SCORE}`,
        };
      }
      settings[category].secondsPerScore = Math.round(part.secondsPerScore * 100) / 100;
    }

    if (category === 'Diff') {
      const line = part.line;
      if (!isObject(line) || Object.keys(line).some((k) => k !== 'max' && k !== 'moves')) return unreadable;
      if (!validLineMax(line.max)) {
        return { error: `The numberline max must be a number from ${MIN_LINE_MAX} to ${MAX_LINE_MAX}` };
      }
      if (!Array.isArray(line.moves) || line.moves.length > MAX_MOVES) {
        return { error: `A numberline can have at most ${MAX_MOVES} moves` };
      }
      const moves: DifficultyLine['moves'] = [];
      for (const move of line.moves) {
        if (!isObject(move) || Object.keys(move).some((k) => k !== 'name' && k !== 'position')) return unreadable;
        if (!validMoveName(move.name)) return { error: `Each move needs a name of up to ${MAX_MOVE_NAME} characters` };
        if (!validPosition(move.position)) return { error: `The position of ${move.name.trim()} must be from 0 to 1` };
        moves.push({ name: move.name.trim(), position: Math.round(move.position * 1000) / 1000 });
      }
      settings[category].line = { max: Math.round(line.max * 100) / 100, moves };
    }
  }
  return { settings };
}

export function sameSettings(a: SystemSettings, b: SystemSettings): boolean {
  return NOTE_CATEGORIES.every(
    (c) =>
      CATEGORY_NOTES[c].every((n) => a[c].noteWeights[n.type] === b[c].noteWeights[n.type]) &&
      a[c].estimate.areaScale === b[c].estimate.areaScale &&
      a[c].estimate.power === b[c].estimate.power &&
      a[c].secondsPerScore === b[c].secondsPerScore &&
      JSON.stringify(a[c].line ?? null) === JSON.stringify(b[c].line ?? null)
  );
}
