import 'server-only';
import crypto from 'node:crypto';
import {
  dynamoGetItem,
  dynamoPutItem,
  dynamoScanAll,
  EVENT_RESULTS_INFO_TABLE_NAME,
  EVENT_RESULTS_TABLE_NAME,
  EVENT_SUMMARY_INFO_TABLE_NAME,
  EVENT_SUMMARY_TABLE_NAME,
} from './dynamo-client';
import { applyCanonicalToDynamoPool, dynamoPoolKey } from './mapping';
import type { CanonicalEvent, CanonicalPoolLayout, CanonicalPoolResult } from './mapping';
import { teamKey } from '../event-creator-layout';

// The Postgres -> Dynamo side of the bridge's writes. A Dynamo event item holds every
// division under one key, so pushing one division's changes reads the whole item first and
// only touches that division's own sub-object - any other division already on the live app
// (or any field this bridge doesn't know about: eventState, judgesState, controllerState,
// poolMap, playerData, version counters) passes through untouched.
export async function pushEventToDynamo(eventId: string, canonical: CanonicalEvent): Promise<void> {
  const existing = (await dynamoGetItem<Record<string, unknown>>(eventId)) ?? {};
  const eventData = (existing.eventData as Record<string, unknown>) ?? {};
  const divisionData = { ...((eventData.divisionData as Record<string, unknown>) ?? {}) };

  for (const [name, d] of Object.entries(canonical.divisions)) {
    const roundData: Record<string, unknown> = {};
    for (const [roundName, r] of Object.entries(d.rounds)) {
      roundData[roundName] = { name: roundName, lengthSeconds: d.routineSeconds, poolNames: r.poolLetters };
    }
    divisionData[name] = { ...(divisionData[name] as Record<string, unknown> | undefined), name, roundData, teams: d.roster };
  }

  await dynamoPutItem({
    ...existing,
    key: eventId,
    eventName: canonical.eventName,
    eventData: { ...eventData, divisionData },
  });
}

// A targeted rename (e.g. resolving an eventName conflict) that touches nothing else on
// the event item.
export async function pushEventNameToDynamo(eventId: string, eventName: string): Promise<void> {
  const existing = (await dynamoGetItem<Record<string, unknown>>(eventId)) ?? {};
  await dynamoPutItem({ ...existing, key: eventId, eventName });
}

// Keeps event-summary-service's own copy of this event caught up - freestylejudge.com/admin
// lists its events from here, not from a scan of the main table, so a bridged event needs
// this too to actually show up. One-way (Postgres -> here) and idempotent: called on every
// reconcile of a bridged event, not diffed like the main table, since this is just an index
// entry to keep current, not something the bridge treats as its own source of truth.
// createdAt is preserved once set, matching how a real entry (e.g. FPAW 2026) never changes it.
export async function pushEventSummaryToDynamo(
  eventId: string,
  eventName: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const existing = await dynamoGetItem<{ createdAt?: number }>(eventId, EVENT_SUMMARY_TABLE_NAME);
  await dynamoPutItem(
    {
      ...existing,
      key: eventId,
      eventName,
      startDate,
      endDate,
      createdAt: existing?.createdAt ?? Date.now(),
    },
    EVENT_SUMMARY_TABLE_NAME
  );
}

// event-summary-service only re-scans its table (instead of serving a stale S3-cached
// getAllEvents response) once this flag is true - see dynamo-client.ts. Its own write path
// sets this on every write; this bridge's raw PutItem above doesn't, so it must be set here
// too, or a newly-bridged event stays invisible on the admin site no matter how correct its
// data is. Always a plain PutItem (no read-modify-write needed: the item is just this flag).
export async function markEventSummaryDirty(): Promise<void> {
  await dynamoPutItem({ key: 'info', isEventDataDirty: true }, EVENT_SUMMARY_INFO_TABLE_NAME);
}

// event-results-service's own entry for one division: what feeds getAllResults, which
// PointsService's client (and the admin site's division list) actually reads - confirmed via
// SmilesAir/EventResultsService's source. Its own write path (setEventResults) has no stable
// key of its own to give a division either: it scans the whole table for an existing
// eventId+divisionName match and reuses that item's key, generating a fresh random one only
// if none exists - replicated here so re-syncing the same division never creates a duplicate
// entry. rawText is left blank (per the user - it's stored as-is, never parsed server-side,
// so an empty string is a safe, honest "no source text" rather than a guessed reconstruction).
export async function pushEventResultsToDynamo(
  eventId: string,
  eventName: string,
  divisionName: string,
  resultsData: Record<string, unknown>,
  isHidden: boolean
): Promise<void> {
  const existingItems = await dynamoScanAll(EVENT_RESULTS_TABLE_NAME);
  const existing = existingItems.find((i) => i.eventId === eventId && i.divisionName === divisionName) as
    | { key: string; createdAt?: number }
    | undefined;
  const key = existing?.key ?? crypto.randomUUID();

  await dynamoPutItem(
    {
      key,
      divisionName,
      eventId,
      eventName,
      createdAt: existing?.createdAt ?? Date.now(),
      rawText: '',
      resultsData,
      isHidden,
    },
    EVENT_RESULTS_TABLE_NAME
  );
}

// Same cache-invalidation story as markEventSummaryDirty, this service's own field name.
export async function markEventResultsDirty(): Promise<void> {
  await dynamoPutItem({ key: 'info', isResultsDataDirty: true }, EVENT_RESULTS_INFO_TABLE_NAME);
}

export async function pushPoolLayoutToDynamo(
  eventId: string,
  divisionName: string,
  roundName: string,
  letter: string,
  canonical: CanonicalPoolLayout
): Promise<void> {
  const key = dynamoPoolKey(eventId, divisionName, roundName, letter);
  const existing = await dynamoGetItem<Record<string, unknown>>(key);
  await dynamoPutItem(applyCanonicalToDynamoPool(existing, key, canonical));
}

// Carries over each team's final score once Postgres has it (see the plan: only the coarse
// place/score, never per-judge detail). This never invents Dynamo's own "every judge scored"
// completeness signal (see mapping.ts) - that's only this bridge's own read-side heuristic,
// not something a write needs to satisfy.
export async function pushPoolResultToDynamo(
  eventId: string,
  divisionName: string,
  roundName: string,
  letter: string,
  result: CanonicalPoolResult
): Promise<void> {
  const key = dynamoPoolKey(eventId, divisionName, roundName, letter);
  const existing = await dynamoGetItem<{ teamData?: { players?: string[]; teamScore?: number }[] }>(key);
  if (!existing?.teamData) return; // nothing to attach a result to
  const teamData = existing.teamData.map((t) => {
    const found = result[teamKey(t.players ?? [])];
    return found ? { ...t, teamScore: found.score } : t;
  });
  await dynamoPutItem({ ...existing, key, teamData });
}
