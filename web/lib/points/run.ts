import 'server-only';
import { divisionCounts } from './divisions';
import { loadEvents, loadPlayers } from './load';
import type { PointsParams } from './params';
import { buildRankings } from './rankings';
import { buildRatings } from './ratings';
import type { EventInput, PlayerMap, RankingRow, RatingRow, ResultsInput } from './types';

// Which events (and, within them, which divisions) the rankings are made from.
// Ratings always use every event, as PointsService does.
export type Selection = { eventIds: string[]; excludedDivisionIds: string[] };

export type GeneratorOutput = {
  open: RankingRow[];
  women: RankingRow[];
  ratings: RatingRow[];
  // The event and division names the rankings' results refer to.
  names: Record<string, { eventName: string; divisionName: string; startDate: string }>;
  counts: { events: number; divisions: number; from: string | null; to: string | null };
};

type Data = { events: EventInput[]; players: PlayerMap; loadedAt: number };

// The database is read once a minute at most for the tool's previews (a preview
// runs again after every change of selection); publishing always reads fresh.
const DATA_TTL_MS = 60 * 1000;
let cache: Data | null = null;
let ratingsCache: { key: string; loadedAt: number; rows: RatingRow[] } | null = null;

async function getData(fresh: boolean): Promise<Data> {
  if (!fresh && cache && Date.now() - cache.loadedAt < DATA_TTL_MS) return cache;
  const [events, players] = await Promise.all([loadEvents(), loadPlayers()]);
  cache = { events, players, loadedAt: Date.now() };
  return cache;
}

// The ratings depend on these parameters only, so a change of selection or of a
// ranking setting doesn't redo them.
const ratingsKey = (params: PointsParams) =>
  JSON.stringify([params.roundOrder, params.ratings, params.rankings.majorNames, params.rankings.worldsNames]);

export async function runGenerator(selection: Selection, params: PointsParams, opts: { fresh?: boolean; skipRatings?: boolean } = {}): Promise<GeneratorOutput> {
  const data = await getData(opts.fresh === true);
  const chosen = new Set(selection.eventIds);
  const excluded = new Set(selection.excludedDivisionIds);

  const selectedEvents = data.events.filter((event) => chosen.has(event.id));
  const results: ResultsInput[] = selectedEvents.flatMap((event) => event.results.filter((division) => !excluded.has(division.id)));

  const open = buildRankings(results.filter((r) => divisionCounts(r.divisionName, 'open', params)), data.players, 'open', params);
  const women = buildRankings(results.filter((r) => divisionCounts(r.divisionName, 'women', params)), data.players, 'women', params);

  const key = ratingsKey(params);
  let ratings: RatingRow[] = [];
  if (opts.skipRatings) {
    // Not asked for (the ratings tab isn't open): nothing to send or calculate.
  } else if (!opts.fresh && ratingsCache && ratingsCache.key === key && ratingsCache.loadedAt === data.loadedAt) {
    ratings = ratingsCache.rows;
  } else {
    ratings = buildRatings(data.events, data.players, params);
    ratingsCache = { key, loadedAt: data.loadedAt, rows: ratings };
  }

  const used = new Set<string>();
  for (const row of [...open, ...women]) for (const item of row.pointsList) used.add(item.resultsId);
  const names: GeneratorOutput['names'] = {};
  for (const event of data.events) {
    for (const division of event.results) {
      if (used.has(division.id)) names[division.id] = { eventName: event.name, divisionName: division.divisionName, startDate: event.startDate };
    }
  }

  const dates = selectedEvents.map((event) => event.startDate).sort();
  return {
    open,
    women,
    ratings,
    names,
    counts: { events: selectedEvents.length, divisions: used.size, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
  };
}
