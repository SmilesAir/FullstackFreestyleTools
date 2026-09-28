// The public API's endpoints, as the admin Settings page lists them (and the
// README's "List of APIs" describes them). Every one is a read-only GET under
// /api/v1 that needs no login, answers CORS, is rate limited and cached.

export type PublicApiEndpoint = {
  path: string;
  // A real request to try it, when the path needs no made-up key.
  example?: string;
  description: string;
  returns: string;
};

export type PublicApiGroup = { name: string; description: string; endpoints: PublicApiEndpoint[] };

export const PUBLIC_APIS: PublicApiGroup[] = [
  {
    name: 'Points API',
    description:
      'Feeds the ResultsRender results site: the same five calls and JSON shapes as the old PointsService, so ResultsRender only needs its endpoint addresses changed.',
    endpoints: [
      {
        path: '/api/v1/points/getManifest',
        example: '/api/v1/points/getManifest',
        description: 'Every published ranking and rating version: one per type and division per publish date.',
        returns: '{ manifest: { "<type>-<division>_<date>": { key, date, divisionName, createdAt, dataPath, isHidden } } }, e.g. key "ranking-open_2026-9-25".',
      },
      {
        path: '/api/v1/points/downloadPointsData/{key}',
        description: 'One published version, by a key from getManifest. 404 for an unknown key.',
        returns:
          '{ data: [...] }: ranking rows { id, fullName, rank, points, resultsCount, pointsList: [{ resultsId, points }] }, or rating rows { id, fullName, rating, matchCount, highestRating, highestRatingDate, highestRank, highestRankDate }.',
      },
      {
        path: '/api/v1/points/getAllResults',
        example: '/api/v1/points/getAllResults',
        description: "Every division that has placed teams. A resultsId is the division id the rankings' pointsList refers to.",
        returns: '{ results: { [resultsId]: { eventName, divisionName, ... } } }',
      },
      {
        path: '/api/v1/points/getAllEvents',
        example: '/api/v1/points/getAllEvents',
        description: 'Every event with its dates.',
        returns: '{ allEventSummaryData: { [eventId]: { eventName, startDate, endDate } } }',
      },
      {
        path: '/api/v1/points/getAllPlayers',
        example: '/api/v1/points/getAllPlayers',
        description: 'The players who appear in published rankings and ratings.',
        returns: '{ players: { [playerId]: { firstName, lastName } } }',
      },
    ],
  },
  {
    name: 'Rankings API',
    description: 'The live ranking (the one the last publish in the Rankings Generator put there), a page at a time.',
    endpoints: [
      {
        path: '/api/v1/rankings?category={category}&page={page}&country={country}',
        example: '/api/v1/rankings?category=ranking-open&page=1',
        description:
          'category is required: ranking-open or ranking-women. page starts at 1, 50 players a page. country (optional) keeps one country. Hidden players are left out.',
        returns:
          '{ category, page, totalPages, results: [{ rank, points, results_count, player_id, first_name, last_name, country, membership }] }',
      },
    ],
  },
];
