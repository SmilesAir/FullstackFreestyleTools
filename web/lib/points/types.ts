// What the rankings and ratings are calculated from: plain data, no database.

export type PlayerRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  // The main player this one is an alias of (followed until there is no further link).
  aliasId: string | null;
  // 'F' marks a woman.
  gender: string | null;
};

export type PlayerMap = ReadonlyMap<string, PlayerRecord>;

// One team's result in a division: its players and where it placed in its round.
export type TeamResult = { players: string[]; place: number };

// One division of one event. `rounds` are in playing order (Finals, round 1, first);
// the teams of a round's pools are given pool after pool.
export type ResultsInput = {
  // Also the id the published rankings refer to it by.
  id: string;
  eventId: string;
  eventName: string;
  divisionName: string;
  // Milliseconds: the order divisions of one event are processed in.
  createdAt: number;
  rounds: { round: number; teams: TeamResult[] }[];
};

export type EventInput = {
  id: string;
  name: string;
  // As written ("2026-9-25"): kept for the peak rating date.
  startDate: string;
  // Milliseconds: the order events are processed in.
  startMs: number;
  results: ResultsInput[];
};

export type RankingRow = {
  id: string;
  fullName: string;
  rank: number;
  points: number;
  resultsCount: number;
  // Every result, highest first.
  pointsList: { resultsId: string; points: number }[];
};

export type RatingRow = {
  id: string;
  fullName: string;
  rating: number;
  matchCount: number;
  highestRating: number;
  highestRatingDate: string;
  highestRank: number;
  highestRankDate: string;
};
