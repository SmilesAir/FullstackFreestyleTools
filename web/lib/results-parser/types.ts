import { ROUNDS } from '../event-creator';
import type { Candidate } from '../player-match-types';

// Shared (client + server) shapes for the Results Parser.

// Rounds are counted back from the Finals; a few older events ran more than four.
export const MAX_ROUND = 6;

export const roundName = (n: number) => ROUNDS.find((r) => r.number === n)?.name ?? `Round ${n}`;

// What the editor holds for one player slot: a real player once picked, plus the
// written name and match suggestions when Claude filled it in.
export type Slot = {
  id: string | null;
  name: string;
  input?: string;
  status?: 'matched' | 'uncertain' | 'none';
  candidates?: Candidate[];
  created?: boolean;
};
export type EditorTeam = { key: string; place: number | null; players: Slot[] };
export type EditorPool = { letter: string; teams: EditorTeam[] };
export type EditorRound = { round: number; pools: EditorPool[] };

// What is validated and saved: only ids and places, no display data.
export type SaveTeam = { place: number | null; players: (string | null)[] };
export type SaveRound = { round: number; pools: { letter: string; teams: SaveTeam[] }[] };

export function toSaveRounds(rounds: EditorRound[]): SaveRound[] {
  return rounds.map((r) => ({
    round: r.round,
    pools: r.pools.map((p) => ({
      letter: p.letter,
      teams: p.teams.map((t) => ({ place: t.place, players: t.players.map((s) => s.id) })),
    })),
  }));
}

let counter = 0;
// Not crypto.randomUUID: it doesn't exist on pages served over plain http (a phone on the LAN).
export const newKey = () => `t${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export type ParsedDivision = { divisionName: string; rounds: EditorRound[] };

export type ParseResultsResult =
  | { error: string }
  | {
      error: null;
      eventName: string | null;
      startDate: string | null;
      endDate: string | null;
      divisions: ParsedDivision[];
      unparsed: string[];
    };

export type EventOption = { id: string; event_name: string; start_date: string; end_date: string };

export type LoadedDivision = { divisionId: string | null; isHidden: boolean | null; rounds: EditorRound[] };
