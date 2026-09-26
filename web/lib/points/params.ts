// Every number and name list the rankings and ratings depend on. The defaults are
// SmilesAir/PointsService's own constants, except the ratings' major and worlds K
// factors, which its code swaps by mistake (worlds got 48, majors 64): here worlds
// is 64 and majors 48, as its constants say. Nothing in the algorithm files has a
// number of its own.
export type RankingParams = {
  // K for the open ranking and for the women ranking.
  kOpen: number;
  kWomen: number;
  // Points added to a division's top score for a major / a worlds event.
  majorBonus: number;
  worldsBonus: number;
  // How many of a player's best results are added up.
  topResults: number;
  // A division's top score is numPlayers^playerExponent * K + bonus.
  playerExponent: number;
  // An event whose name contains any of these (case-sensitive) is a major / worlds.
  majorNames: string[];
  worldsNames: string[];
  // Division names that count (ignoring case and punctuation). Women's ranking counts
  // these as well as its own extra ones.
  openDivisions: string[];
  womenExtraDivisions: string[];
};

export type RatingParams = {
  kDefault: number;
  kMajor: number;
  kWorlds: number;
  startingRating: number;
  // The 400 in 10^(rating / 400).
  eloScale: number;
  // A rating never goes below this.
  minRating: number;
  // A player's peak rank only counts once they have played this many matches.
  minMatchesForPeakRank: number;
};

// The order a division's rounds are read in, which decides which round a player is
// credited with when they appear in several (the first one read counts):
//  - 'legacy': the Finals (round 1) first, then the other rounds from the highest
//    number (the earliest round) down to round 2. This is the order PointsService
//    read them in, so it reproduces the rankings and ratings already published.
//  - 'best-first': round 1, 2, 3, ... so a player is credited with the furthest
//    round they reached.
export type RoundOrder = 'legacy' | 'best-first';

export type PointsParams = { roundOrder: RoundOrder; rankings: RankingParams; ratings: RatingParams };

export const DEFAULT_PARAMS: PointsParams = {
  roundOrder: 'legacy',
  rankings: {
    kOpen: 4,
    kWomen: 10,
    majorBonus: 100,
    worldsBonus: 200,
    topResults: 8,
    playerExponent: 1,
    majorNames: ['Frisbeer', 'European Freestyledisc Championships', 'EFC', 'AFO', 'American Freestyle Championships'],
    worldsNames: ['FPAW'],
    openDivisions: ['Open', 'Open Pairs', 'Random Open', 'Coop', 'Open Coop'],
    womenExtraDivisions: ['Women', 'Women Pairs', 'Mixed', 'Mixed Pairs'],
  },
  ratings: {
    kDefault: 32,
    kMajor: 48,
    kWorlds: 64,
    startingRating: 400,
    eloScale: 400,
    minRating: 1,
    minMatchesForPeakRank: 100,
  },
};

export type ParamProblem = { path: string; message: string };

const MAX_NAMES = 50;
const MAX_NAME_LENGTH = 80;

type NumberField = { path: string; min: number; max: number; integer?: boolean };
type ListField = { path: string };

const NUMBER_FIELDS: NumberField[] = [
  { path: 'rankings.kOpen', min: 0, max: 1000 },
  { path: 'rankings.kWomen', min: 0, max: 1000 },
  { path: 'rankings.majorBonus', min: 0, max: 100000 },
  { path: 'rankings.worldsBonus', min: 0, max: 100000 },
  { path: 'rankings.topResults', min: 1, max: 50, integer: true },
  { path: 'rankings.playerExponent', min: 0.1, max: 3 },
  { path: 'ratings.kDefault', min: 0, max: 1000 },
  { path: 'ratings.kMajor', min: 0, max: 1000 },
  { path: 'ratings.kWorlds', min: 0, max: 1000 },
  { path: 'ratings.startingRating', min: 0, max: 10000 },
  { path: 'ratings.eloScale', min: 50, max: 2000 },
  { path: 'ratings.minRating', min: 0, max: 10000 },
  { path: 'ratings.minMatchesForPeakRank', min: 0, max: 10000, integer: true },
];

const LIST_FIELDS: ListField[] = [
  { path: 'rankings.majorNames' },
  { path: 'rankings.worldsNames' },
  { path: 'rankings.openDivisions' },
  { path: 'rankings.womenExtraDivisions' },
];

function read(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function write(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts.slice(0, -1)) current = current[part] as Record<string, unknown>;
  current[parts[parts.length - 1]] = value;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Problem with one number, or null when it is fine.
function numberProblem(value: unknown, field: NumberField): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
  if (field.integer && !Number.isInteger(value)) return 'must be a whole number';
  if (value < field.min || value > field.max) return `must be from ${field.min} to ${field.max}`;
  return null;
}

// Problem with one list of names, or null when it is fine.
function listProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'must be a list';
  if (value.length > MAX_NAMES) return `can have at most ${MAX_NAMES} names`;
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') return 'names cannot be empty';
    if (item.length > MAX_NAME_LENGTH) return `names can have at most ${MAX_NAME_LENGTH} characters`;
  }
  return null;
}

// Strict: every value must be right (what the tool sends). Names are trimmed, and
// repeated names are dropped.
export function validateParams(raw: unknown): { ok: true; params: PointsParams } | { ok: false; problems: ParamProblem[] } {
  const problems: ParamProblem[] = [];
  const out = clone(DEFAULT_PARAMS) as unknown as Record<string, unknown>;
  for (const field of NUMBER_FIELDS) {
    const value = read(raw, field.path);
    const problem = numberProblem(value, field);
    if (problem) problems.push({ path: field.path, message: problem });
    else write(out, field.path, value);
  }
  for (const field of LIST_FIELDS) {
    const value = read(raw, field.path);
    const problem = listProblem(value);
    if (problem) problems.push({ path: field.path, message: problem });
    else write(out, field.path, [...new Set((value as string[]).map((name) => name.trim()))]);
  }
  const roundOrder = read(raw, 'roundOrder');
  if (roundOrder !== 'legacy' && roundOrder !== 'best-first') problems.push({ path: 'roundOrder', message: "must be 'legacy' or 'best-first'" });
  else out.roundOrder = roundOrder;
  const startingRating = read(raw, 'ratings.startingRating');
  const minRating = read(raw, 'ratings.minRating');
  if (typeof startingRating === 'number' && typeof minRating === 'number' && minRating > startingRating) {
    problems.push({ path: 'ratings.minRating', message: 'cannot be above the starting rating' });
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, params: out as unknown as PointsParams };
}

// Lenient: for a value read back from storage. Each field that is missing or wrong
// falls back to its default, so an old or damaged saved value never breaks the tool.
export function resolveParams(raw: unknown): PointsParams {
  const out = clone(DEFAULT_PARAMS) as unknown as Record<string, unknown>;
  for (const field of NUMBER_FIELDS) {
    const value = read(raw, field.path);
    if (numberProblem(value, field) === null) write(out, field.path, value);
  }
  for (const field of LIST_FIELDS) {
    const value = read(raw, field.path);
    if (listProblem(value) === null) write(out, field.path, [...new Set((value as string[]).map((name) => name.trim()))]);
  }
  const roundOrder = read(raw, 'roundOrder');
  if (roundOrder === 'legacy' || roundOrder === 'best-first') out.roundOrder = roundOrder;
  const params = out as unknown as PointsParams;
  if (params.ratings.minRating > params.ratings.startingRating) params.ratings.minRating = DEFAULT_PARAMS.ratings.minRating;
  return params;
}
