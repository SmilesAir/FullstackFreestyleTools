import type { PointsParams } from './params';

// A division or event name as compared: lowercase, letters and digits only, so
// "Open Co-op", "open coop" and "Open Coop" are the same.
export const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export type RankingKind = 'open' | 'women';

// Whether a division counts towards the open or the women's ranking.
export function divisionCounts(divisionName: string, kind: RankingKind, params: PointsParams): boolean {
  const names = kind === 'open' ? params.rankings.openDivisions : [...params.rankings.openDivisions, ...params.rankings.womenExtraDivisions];
  const wanted = normalizeName(divisionName);
  return wanted !== '' && names.some((name) => normalizeName(name) === wanted);
}

// Whether it counts towards either ranking.
export const divisionCountsAtAll = (divisionName: string, params: PointsParams) => divisionCounts(divisionName, 'women', params);

// 'worlds', 'major' or null, by the words in the event's name (case-sensitive, as
// PointsService did it). Worlds wins if both match.
export function eventTier(eventName: string, params: PointsParams): 'worlds' | 'major' | null {
  if (params.rankings.worldsNames.some((name) => eventName.includes(name))) return 'worlds';
  if (params.rankings.majorNames.some((name) => eventName.includes(name))) return 'major';
  return null;
}
