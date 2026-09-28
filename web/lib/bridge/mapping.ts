// Pure functions, no I/O: turn a raw Dynamo item (from freestyle-judge-production-dataTable)
// into the same canonical shape the Postgres side is read into (web/lib/bridge/postgres-reader.ts),
// so reconcile.ts can diff and merge without caring which side a value came from. Kept
// dependency-free (besides teamKey) so it's easy to unit-test against the real item shapes
// this was designed from.
import { teamKey } from '../event-creator-layout';

export const dynamoEventKey = (eventId: string) => eventId;
export const dynamoPoolKey = (eventId: string, divisionName: string, roundName: string, letter: string) =>
  `pool|${eventId}|${divisionName}|${roundName}|${letter}`;

export type CanonicalEvent = {
  eventName: string;
  divisions: Record<
    string,
    {
      routineSeconds: number;
      rounds: Record<string, { poolLetters: string[] }>;
      // Each entry is one roster team's player ids (source order, not sorted).
      roster: string[][];
    }
  >;
};

export type CanonicalPoolLayout = {
  locked: boolean;
  // Team player-id lists, in play order (source order, not sorted).
  order: string[][];
};

// teamKey(players) -> { score, place }. Only produced once every listed judge has scored
// every team (see dynamoPoolResultToCanonical) - a partial/in-progress pool has no result.
export type CanonicalPoolResult = Record<string, { score: number; place: number }>;

type DynamoRoundData = { name?: string; lengthSeconds?: number; poolNames?: string[] };
type DynamoDivisionData = { name?: string; roundData?: Record<string, DynamoRoundData>; teams?: string[][] };
type DynamoEventItem = {
  eventName?: string;
  eventData?: { divisionData?: Record<string, DynamoDivisionData> };
};

export function dynamoEventToCanonical(item: Record<string, unknown>): CanonicalEvent {
  const raw = item as DynamoEventItem;
  const divisionData = raw.eventData?.divisionData ?? {};
  const divisions: CanonicalEvent['divisions'] = {};

  for (const [name, d] of Object.entries(divisionData)) {
    const rounds: Record<string, { poolLetters: string[] }> = {};
    const lengths: number[] = [];
    for (const [roundName, r] of Object.entries(d.roundData ?? {})) {
      rounds[roundName] = { poolLetters: [...(r.poolNames ?? [])] };
      if (typeof r.lengthSeconds === 'number') lengths.push(r.lengthSeconds);
    }
    // Postgres has one routine length per division; Dynamo allows one per round. Use the
    // first one seen - a real mismatch across rounds shows up as an ordinary conflict once
    // compared against whatever Postgres already has, rather than being specially detected.
    divisions[name] = {
      routineSeconds: lengths[0] ?? 180,
      rounds,
      roster: (d.teams ?? []).map((t) => [...t]),
    };
  }
  return { eventName: raw.eventName ?? '', divisions };
}

type DynamoTeamData = { players?: string[]; teamScore?: number; judgeData?: Record<string, unknown> };
type DynamoPoolItem = { isLocked?: boolean; judges?: Record<string, unknown>; teamData?: DynamoTeamData[] };

export function dynamoPoolToCanonical(item: Record<string, unknown>): CanonicalPoolLayout {
  const raw = item as DynamoPoolItem;
  return {
    locked: !!raw.isLocked,
    order: (raw.teamData ?? []).map((t) => [...(t.players ?? [])]),
  };
}

// null unless the pool is locked (isLocked - the same "this is done" signal the Postgres
// side gates on via pools.locked, see postgres-reader.ts) *and* every judge has scored every
// team. There's no other explicit "done" flag in this legacy schema, so completeness is
// derived, but isLocked alone already means "frozen, nothing more will change" on the live
// app - checking it here avoids reporting a result while judging might still be mid-flight
// even once every currently-listed judge happens to have an entry.
export function dynamoPoolResultToCanonical(item: Record<string, unknown>): CanonicalPoolResult | null {
  const raw = item as DynamoPoolItem;
  if (!raw.isLocked) return null;
  const judgeIds = Object.keys(raw.judges ?? {});
  const teamData = raw.teamData ?? [];
  if (judgeIds.length === 0 || teamData.length === 0) return null;
  const complete = teamData.every((t) => judgeIds.every((j) => (t.judgeData ?? {})[j] !== undefined));
  if (!complete) return null;

  // Equal scores share a place, and the next distinct score skips ahead by how many tied
  // (1, 2, 2, 4) - the same convention the Results Parser's own prompt uses.
  const scored = teamData.map((t) => ({ key: teamKey(t.players ?? []), score: Number(t.teamScore ?? 0) }));
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const result: CanonicalPoolResult = {};
  let place = 1;
  ranked.forEach((r, i) => {
    if (i > 0 && r.score !== ranked[i - 1].score) place = i + 1;
    result[r.key] = { score: r.score, place };
  });
  return result;
}

// Builds the teamData/isLocked/judges shape a pool item needs for a PutItem, carrying over
// whatever judges/scoring the item already had (this bridge never writes granular scores -
// see the plan - so an existing item's judges/judgeData/teamScore fields pass through
// untouched; only isLocked and each team's position in teamData change).
export function applyCanonicalToDynamoPool(
  existing: Record<string, unknown> | null,
  key: string,
  canonical: CanonicalPoolLayout
): Record<string, unknown> & { key: string } {
  const existingTeams = ((existing as DynamoPoolItem | null)?.teamData ?? []) as DynamoTeamData[];
  const byKey = new Map(existingTeams.map((t) => [teamKey(t.players ?? []), t]));
  const teamData: DynamoTeamData[] = canonical.order.map((players) => {
    const found = byKey.get(teamKey(players));
    return found ? { ...found, players } : { players, teamScore: 0, judgeData: {} };
  });
  return {
    ...(existing ?? {}),
    key,
    isLocked: canonical.locked,
    judges: (existing as DynamoPoolItem | null)?.judges ?? {},
    teamData,
  };
}
