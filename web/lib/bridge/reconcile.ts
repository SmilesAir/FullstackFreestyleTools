import 'server-only';
import { pool } from '../db';
import { teamKey } from '../event-creator-layout';
import { dynamoEventKey, dynamoEventToCanonical, dynamoPoolKey, dynamoPoolToCanonical, dynamoPoolResultToCanonical } from './mapping';
import type { CanonicalEvent, CanonicalPoolLayout, CanonicalPoolResult } from './mapping';
import { dynamoGetItem } from './dynamo-client';
import {
  findDivisionIdByName,
  getBridgeEnabledEventIds,
  getDivisionResultsData,
  getDivisionsForEventResults,
  getEventSummaryFields,
  postgresEventToCanonical,
  postgresPoolResultToCanonical,
  postgresPoolToCanonical,
  roundNumberForName,
} from './postgres-reader';
import { addMissingRosterTeams, applyPoolLayout, applyPoolResult, createDivisionIfMissing, updateEventName } from './postgres-writer';
import {
  markEventResultsDirty,
  markEventSummaryDirty,
  pushEventResultsToDynamo,
  pushEventSummaryToDynamo,
  pushEventToDynamo,
  pushPoolLayoutToDynamo,
  pushPoolResultToDynamo,
} from './dynamo-writer';

export type ReconcileSummary = {
  dryRun: boolean;
  eventsChecked: number;
  applied: { toDynamo: number; toPostgres: number };
  conflicts: number;
  errors: string[];
};

type Action<T> = { action: 'noop' | 'to-dynamo' | 'to-postgres' | 'conflict'; value?: T };

// No ancestor (first time this entity/field has ever been compared) doesn't assume a
// direction by treating both sides as "changed" - that would flag an event that simply
// doesn't exist on one side yet (nothing to disagree with) the same as two sides that had
// already independently diverged before the bridge ever ran. Instead, a missing ancestor
// falls back to `empty` (whatever "nothing here yet" naturally looks like for this field -
// '', {divisions:{}}, {locked:false,order:[]}, null): a side that already matches `empty`
// hasn't "changed" at all, so filling in from the other side is unambiguous, not a conflict.
// A conflict only means two sides both hold real, different data with nothing agreed yet.
export function diff3<T>(ancestor: T | undefined, dynamoNow: T, postgresNow: T, empty: T): Action<T> {
  const eq = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  if (eq(dynamoNow, postgresNow)) return { action: 'noop', value: dynamoNow };
  const baseline = ancestor === undefined ? empty : ancestor;
  const dynamoChanged = !eq(baseline, dynamoNow);
  const postgresChanged = !eq(baseline, postgresNow);
  if (dynamoChanged && !postgresChanged) return { action: 'to-postgres', value: dynamoNow };
  if (postgresChanged && !dynamoChanged) return { action: 'to-dynamo', value: postgresNow };
  return { action: 'conflict' };
}

async function loadSnapshot<T>(entityType: string, entityKey: string): Promise<{ dynamo?: T; postgres?: T }> {
  const result = await pool.query<{ dynamo_snapshot: T | null; postgres_snapshot: T | null }>(
    'SELECT dynamo_snapshot, postgres_snapshot FROM bridge_sync_state WHERE entity_type = $1 AND entity_key = $2',
    [entityType, entityKey]
  );
  const row = result.rows[0];
  return { dynamo: row?.dynamo_snapshot ?? undefined, postgres: row?.postgres_snapshot ?? undefined };
}

async function saveSnapshot(entityType: string, entityKey: string, dynamoValue: unknown, postgresValue: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO bridge_sync_state (entity_type, entity_key, dynamo_snapshot, postgres_snapshot, last_synced_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, now())
     ON CONFLICT (entity_type, entity_key) DO UPDATE
       SET dynamo_snapshot = EXCLUDED.dynamo_snapshot, postgres_snapshot = EXCLUDED.postgres_snapshot, last_synced_at = now()`,
    [entityType, entityKey, JSON.stringify(dynamoValue), JSON.stringify(postgresValue)]
  );
}

async function recordConflict(entityType: string, entityKey: string, field: string, dynamoValue: unknown, postgresValue: unknown): Promise<void> {
  const open = await pool.query(
    'SELECT 1 FROM bridge_conflicts WHERE entity_type = $1 AND entity_key = $2 AND field = $3 AND resolved_at IS NULL',
    [entityType, entityKey, field]
  );
  if (open.rows.length > 0) return; // already flagged; don't spam a new row every run
  await pool.query(
    `INSERT INTO bridge_conflicts (entity_type, entity_key, field, dynamo_value, postgres_value)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [entityType, entityKey, field, JSON.stringify(dynamoValue), JSON.stringify(postgresValue)]
  );
}

export async function reconcile({ dryRun }: { dryRun: boolean }): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { dryRun, eventsChecked: 0, applied: { toDynamo: 0, toPostgres: 0 }, conflicts: 0, errors: [] };
  const eventIds = await getBridgeEnabledEventIds();
  for (const eventId of eventIds) {
    summary.eventsChecked++;
    try {
      await reconcileEvent(eventId, dryRun, summary);
    } catch (err) {
      summary.errors.push(`${eventId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}

async function reconcileEvent(eventId: string, dryRun: boolean, summary: ReconcileSummary): Promise<void> {
  const dynamoItem = await dynamoGetItem<Record<string, unknown>>(dynamoEventKey(eventId));
  let dynamoCanonical = dynamoEventToCanonical(dynamoItem ?? {});
  const postgresCanonical = await postgresEventToCanonical(eventId);
  if (!postgresCanonical) return; // shouldn't happen: eventId came from Postgres's own bridge_enabled list

  const ancestor = await loadSnapshot<CanonicalEvent>('event_roster', eventId);

  // eventName: an ordinary scalar 3-way diff. A 'to-dynamo' resolution needs no separate
  // write here - the unconditional pushEventToDynamo call below already carries Postgres's
  // current name across whenever it differs from what Dynamo had at the start of this pass.
  const nameDiff = diff3(ancestor.dynamo?.eventName, dynamoCanonical.eventName, postgresCanonical.eventName, '');
  if (nameDiff.action === 'to-postgres') {
    if (!dryRun) await updateEventName(eventId, dynamoCanonical.eventName);
    summary.applied.toPostgres++;
  } else if (nameDiff.action === 'conflict') {
    summary.conflicts++;
    if (!dryRun) await recordConflict('event_roster', eventId, 'eventName', dynamoCanonical.eventName, postgresCanonical.eventName);
  }

  // Divisions and rosters are additive/union-only in this bridge (see the plan): a team or
  // division either side has ends up on both, but nothing is ever deleted by reconciliation.
  const divisionNames = new Set([...Object.keys(dynamoCanonical.divisions), ...Object.keys(postgresCanonical.divisions)]);
  for (const name of divisionNames) {
    const fromDynamo = dynamoCanonical.divisions[name];
    const fromPostgres = postgresCanonical.divisions[name];

    let divisionId = await findDivisionIdByName(eventId, name);
    if (!divisionId && fromDynamo) {
      if (!dryRun) divisionId = await createDivisionIfMissing(eventId, name, fromDynamo.routineSeconds);
      summary.applied.toPostgres++;
    }
    if (!divisionId) continue; // exists only in Dynamo and this is a dry run - nothing more to check yet

    if (fromDynamo) {
      const dynamoKeys = new Set(fromDynamo.roster.map(teamKey));
      const postgresKeys = new Set((fromPostgres?.roster ?? []).map(teamKey));
      const missingInPostgres = fromDynamo.roster.filter((ids) => !postgresKeys.has(teamKey(ids)));
      if (missingInPostgres.length > 0) {
        if (!dryRun) await addMissingRosterTeams(divisionId, missingInPostgres);
        summary.applied.toPostgres += missingInPostgres.length;
      }
      const missingInDynamoCount = (fromPostgres?.roster ?? []).filter((ids) => !dynamoKeys.has(teamKey(ids))).length;
      if (missingInDynamoCount > 0) summary.applied.toDynamo += missingInDynamoCount; // carried by the pushEventToDynamo call below
    } else if (fromPostgres) {
      summary.applied.toDynamo += fromPostgres.roster.length; // a division Dynamo doesn't have at all yet
    }
  }

  // One push carries every division's current (now possibly-just-merged) Postgres state to
  // Dynamo in a single item write - cheaper than a separate call per division, and correct
  // either way since it always reflects Postgres's latest.
  const freshPostgres = await postgresEventToCanonical(eventId);
  if (freshPostgres && JSON.stringify(freshPostgres) !== JSON.stringify(dynamoCanonical)) {
    if (!dryRun) await pushEventToDynamo(eventId, freshPostgres);
  }
  dynamoCanonical = freshPostgres ?? dynamoCanonical;
  if (!dryRun) await saveSnapshot('event_roster', eventId, dynamoCanonical, freshPostgres ?? postgresCanonical);

  // event-summary-service's own entry: not part of the 3-way diff above (it's an index the
  // admin site reads, not something this bridge treats as its own source of truth), so it's
  // just kept caught up every run - cheap (one GetItem + one PutItem) and self-healing if it
  // was ever missing or fell behind.
  const summaryFields = await getEventSummaryFields(eventId);
  if (summaryFields) {
    if (!dryRun) {
      await pushEventSummaryToDynamo(eventId, summaryFields.eventName, summaryFields.startDate, summaryFields.endDate);
      // Without this, event-summary-service keeps serving its stale cached event list and a
      // bridged event never actually shows up on the admin site - see dynamo-client.ts.
      await markEventSummaryDirty();
    }
    summary.applied.toDynamo++;
  }

  // event-results-service's own entry per division: the admin site's division/results list
  // (via PointsService's getAllResults), same "keep the index caught up every run" story as
  // the event summary above - not part of the 3-way diff, always rebuilt from Postgres's
  // current state.
  if (summaryFields) {
    const resultDivisions = await getDivisionsForEventResults(eventId);
    for (const division of resultDivisions) {
      const resultsData = await getDivisionResultsData(division.id, eventId, division.divisionName);
      if (!dryRun) {
        await pushEventResultsToDynamo(eventId, summaryFields.eventName, division.divisionName, resultsData, division.isHidden);
        await markEventResultsDirty();
      }
      summary.applied.toDynamo++;
    }
  }

  // Pool-level (layout + finished result), for every round/letter either side has for this division.
  for (const name of divisionNames) {
    const divisionId = await findDivisionIdByName(eventId, name);
    if (!divisionId) continue;
    const rounds = new Set([...Object.keys(dynamoCanonical.divisions[name]?.rounds ?? {}), ...Object.keys(postgresCanonical.divisions[name]?.rounds ?? {})]);
    for (const roundName of rounds) {
      const roundNumber = roundNumberForName(roundName);
      if (roundNumber === null) continue; // an unrecognized round name - nothing this app's model has a slot for
      const letters = new Set([
        ...(dynamoCanonical.divisions[name]?.rounds[roundName]?.poolLetters ?? []),
        ...(postgresCanonical.divisions[name]?.rounds[roundName]?.poolLetters ?? []),
      ]);
      for (const letter of letters) {
        await reconcilePool(eventId, divisionId, name, roundNumber, roundName, letter, dryRun, summary);
      }
    }
  }
}

async function reconcilePool(
  eventId: string,
  divisionId: string,
  divisionName: string,
  roundNumber: number,
  roundName: string,
  letter: string,
  dryRun: boolean,
  summary: ReconcileSummary
): Promise<void> {
  const entityKey = `${divisionId}:${roundNumber}:${letter}`;
  const dynamoItem = await dynamoGetItem<Record<string, unknown>>(dynamoPoolKey(eventId, divisionName, roundName, letter));
  const dynamoLayout = dynamoPoolToCanonical(dynamoItem ?? {});
  const postgresLayout = await postgresPoolToCanonical(divisionId, roundNumber, letter);

  const layoutAncestor = await loadSnapshot<CanonicalPoolLayout>('pool_layout', entityKey);
  const layoutDiff = diff3(layoutAncestor.dynamo, dynamoLayout, postgresLayout, { locked: false, order: [] });
  switch (layoutDiff.action) {
    case 'to-postgres': {
      if (!dryRun) {
        const err = await applyPoolLayout(divisionId, roundNumber, letter, dynamoLayout);
        if (err) summary.errors.push(`${entityKey}: ${err}`);
      }
      summary.applied.toPostgres++;
      break;
    }
    case 'to-dynamo': {
      if (!dryRun) await pushPoolLayoutToDynamo(eventId, divisionName, roundName, letter, postgresLayout);
      summary.applied.toDynamo++;
      break;
    }
    case 'conflict':
      summary.conflicts++;
      if (!dryRun) await recordConflict('pool_layout', entityKey, 'layout', dynamoLayout, postgresLayout);
      break;
    case 'noop':
      break;
  }
  if (!dryRun && layoutDiff.action !== 'conflict') await saveSnapshot('pool_layout', entityKey, dynamoLayout, postgresLayout);

  // Finished result: only once the pool is actually locked (see the plan - that's the one
  // signal both sides already agree means "done"), and only if there's anything to compare.
  const dynamoResult = dynamoPoolResultToCanonical(dynamoItem ?? {});
  const postgresResult = await postgresPoolResultToCanonical(divisionId, roundNumber, letter);
  if (dynamoResult === null && postgresResult === null) return;

  const resultAncestor = await loadSnapshot<CanonicalPoolResult | null>('pool_result', entityKey);
  const resultDiff = diff3(resultAncestor.dynamo ?? null, dynamoResult, postgresResult, null);
  switch (resultDiff.action) {
    case 'to-postgres':
      if (!dryRun && dynamoResult) await applyPoolResult(divisionId, roundNumber, letter, dynamoResult);
      summary.applied.toPostgres++;
      break;
    case 'to-dynamo':
      if (!dryRun && postgresResult) await pushPoolResultToDynamo(eventId, divisionName, roundName, letter, postgresResult);
      summary.applied.toDynamo++;
      break;
    case 'conflict':
      summary.conflicts++;
      if (!dryRun) await recordConflict('pool_result', entityKey, 'result', dynamoResult, postgresResult);
      break;
    case 'noop':
      break;
  }
  if (!dryRun && resultDiff.action !== 'conflict') await saveSnapshot('pool_result', entityKey, dynamoResult, postgresResult);
}
