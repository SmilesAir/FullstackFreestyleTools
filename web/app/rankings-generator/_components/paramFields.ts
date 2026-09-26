// What the Settings tab shows for each tunable (see lib/points/params.ts for the values and limits).
export type NumberFieldDef = { path: string; label: string; help: string; step: number };
export type ListFieldDef = { path: string; label: string; help: string };

export const RANKING_NUMBERS: NumberFieldDef[] = [
  { path: 'rankings.kOpen', label: 'K, open ranking', help: 'Scales a division’s top score: players × K + bonus.', step: 0.5 },
  { path: 'rankings.kWomen', label: 'K, women ranking', help: 'The same, for the women’s ranking.', step: 0.5 },
  { path: 'rankings.majorBonus', label: 'Major event bonus', help: 'Points added to a major event’s top score.', step: 10 },
  { path: 'rankings.worldsBonus', label: 'Worlds bonus', help: 'Points added to a worlds event’s top score (replaces the major bonus).', step: 10 },
  { path: 'rankings.topResults', label: 'Results counted per player', help: 'How many of a player’s best results are added up.', step: 1 },
  { path: 'rankings.playerExponent', label: 'Player-count exponent', help: 'Top score = players^exponent × K + bonus. 1 = grows with the field size.', step: 0.1 },
];

export const RANKING_LISTS: ListFieldDef[] = [
  { path: 'rankings.majorNames', label: 'Major event names', help: 'An event whose name contains any of these is a major (case-sensitive). Also sets the major K in ratings.' },
  { path: 'rankings.worldsNames', label: 'Worlds event names', help: 'An event whose name contains any of these is a worlds (case-sensitive).' },
  { path: 'rankings.openDivisions', label: 'Divisions counted (open)', help: 'Division names that count for the open ranking, ignoring case and punctuation.' },
  { path: 'rankings.womenExtraDivisions', label: 'Extra divisions for the women’s ranking', help: 'Counted for the women’s ranking as well as the open ones above.' },
];

export const RATING_NUMBERS: NumberFieldDef[] = [
  { path: 'ratings.kDefault', label: 'K, ordinary events', help: 'How far one match moves a rating.', step: 1 },
  { path: 'ratings.kMajor', label: 'K, major events', help: 'Used for events matching the major names.', step: 1 },
  { path: 'ratings.kWorlds', label: 'K, worlds events', help: 'Used for events matching the worlds names.', step: 1 },
  { path: 'ratings.startingRating', label: 'Starting rating', help: 'What a new player’s rating starts from.', step: 10 },
  { path: 'ratings.eloScale', label: 'Elo scale', help: 'The 400 in 10^(rating ÷ 400): a smaller number makes rating gaps count for more.', step: 10 },
  { path: 'ratings.minRating', label: 'Lowest rating', help: 'A rating never goes below this.', step: 1 },
  { path: 'ratings.minMatchesForPeakRank', label: 'Matches before a peak rank counts', help: 'A player’s best rank only counts once they have played this many matches.', step: 10 },
];

export const DEFAULT_ROUND_ORDER_HELP =
  'Which round a player is credited with when they appear in several. "PointsService order" reads the Finals first, then the earliest round to the latest, which reproduces the published rankings. "Furthest round" credits the furthest round they reached.';

export function getPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// A copy of `obj` with the value at `path` replaced.
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const copy = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const parts = path.split('.');
  let current = copy;
  for (const part of parts.slice(0, -1)) current = current[part] as Record<string, unknown>;
  current[parts[parts.length - 1]] = value;
  return copy as T;
}
