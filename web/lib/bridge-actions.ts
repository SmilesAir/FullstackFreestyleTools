'use server';

import { requireAdmin } from './authz';
import { pool } from './db';
import { reconcile, type ReconcileSummary } from './bridge/reconcile';
import { applyPoolLayout, applyPoolResult, updateEventName } from './bridge/postgres-writer';
import { pushEventNameToDynamo, pushPoolLayoutToDynamo, pushPoolResultToDynamo } from './bridge/dynamo-writer';
import { roundNameByNumber } from './bridge/postgres-reader';
import type { CanonicalPoolLayout, CanonicalPoolResult } from './bridge/mapping';

// The Data Bridge tool's admin surface: a manual "run now" (dry or for real) and the
// open-conflicts list a person resolves by hand (see the plan - reconciliation never guesses
// when both sides changed a thing differently since the last agreed state). Admin-only, same
// as Backups/Settings - this can write to a live production data store.
const guard = () => requireAdmin();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opts an event into the bridge, or back out. Off by default for every event, old and new,
// until someone turns it on deliberately for that one event.
export async function setEventBridgeEnabled(eventId: string, enabled: boolean): Promise<{ error: string | null }> {
  await guard();
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const result = await pool.query('UPDATE events SET bridge_enabled = $2 WHERE id = $1', [eventId, enabled]);
  return result.rowCount === 0 ? { error: 'Unknown event' } : { error: null };
}

export async function runBridgeNow(dryRun: boolean): Promise<ReconcileSummary> {
  await guard();
  return reconcile({ dryRun });
}

export type BridgeConflictRow = {
  id: string;
  entity_type: string;
  entity_key: string;
  field: string;
  dynamo_value: unknown;
  postgres_value: unknown;
  detected_at: string;
};

export async function getOpenBridgeConflicts(): Promise<BridgeConflictRow[]> {
  await guard();
  const result = await pool.query<BridgeConflictRow>(
    `SELECT id, entity_type, entity_key, field, dynamo_value, postgres_value, detected_at::text
     FROM bridge_conflicts WHERE resolved_at IS NULL ORDER BY detected_at DESC LIMIT 200`
  );
  return result.rows;
}

async function lookupEventAndDivisionName(divisionId: string): Promise<{ eventId: string; divisionName: string }> {
  const result = await pool.query<{ event_id: string; division_name: string }>(
    'SELECT event_id, division_name FROM divisions WHERE id = $1',
    [divisionId]
  );
  if (!result.rows[0]) throw new Error('Division not found');
  return { eventId: result.rows[0].event_id, divisionName: result.rows[0].division_name };
}

// Applies whichever side the person picked (or just clears the flag for "ignored"), then
// seeds bridge_sync_state with that as the new agreed value so the next run doesn't
// immediately re-flag the same disagreement.
export async function resolveBridgeConflict(id: string, resolution: 'dynamo' | 'postgres' | 'ignored'): Promise<{ error: string | null }> {
  await guard();
  const row = await pool.query<{ entity_type: string; entity_key: string; field: string; dynamo_value: unknown; postgres_value: unknown }>(
    'SELECT entity_type, entity_key, field, dynamo_value, postgres_value FROM bridge_conflicts WHERE id = $1 AND resolved_at IS NULL',
    [id]
  );
  const conflict = row.rows[0];
  if (!conflict) return { error: 'Already resolved' };

  if (resolution !== 'ignored') {
    const [divisionId, roundNumberStr, letter] = conflict.entity_key.split(':');
    const roundNumber = Number(roundNumberStr);
    try {
      if (conflict.entity_type === 'pool_layout' && conflict.dynamo_value && conflict.postgres_value) {
        const chosen = (resolution === 'dynamo' ? conflict.dynamo_value : conflict.postgres_value) as CanonicalPoolLayout;
        if (resolution === 'dynamo') {
          const err = await applyPoolLayout(divisionId, roundNumber, letter, chosen);
          if (err) return { error: err };
        } else {
          const { eventId, divisionName } = await lookupEventAndDivisionName(divisionId);
          await pushPoolLayoutToDynamo(eventId, divisionName, roundNameByNumber(roundNumber), letter, chosen);
        }
      } else if (conflict.entity_type === 'pool_result' && conflict.dynamo_value && conflict.postgres_value) {
        const chosen = (resolution === 'dynamo' ? conflict.dynamo_value : conflict.postgres_value) as CanonicalPoolResult;
        if (resolution === 'dynamo') {
          await applyPoolResult(divisionId, roundNumber, letter, chosen);
        } else {
          const { eventId, divisionName } = await lookupEventAndDivisionName(divisionId);
          await pushPoolResultToDynamo(eventId, divisionName, roundNameByNumber(roundNumber), letter, chosen);
        }
      } else if (conflict.entity_type === 'event_roster' && conflict.field === 'eventName') {
        // Here entity_key is the event id itself (see reconcile.ts), not "division:round:letter".
        const eventId = conflict.entity_key;
        const chosen = (resolution === 'dynamo' ? conflict.dynamo_value : conflict.postgres_value) as string;
        if (resolution === 'dynamo') await updateEventName(eventId, chosen);
        else await pushEventNameToDynamo(eventId, chosen);
      }

      await pool.query(
        `INSERT INTO bridge_sync_state (entity_type, entity_key, dynamo_snapshot, postgres_snapshot, last_synced_at)
         VALUES ($1, $2, $3::jsonb, $3::jsonb, now())
         ON CONFLICT (entity_type, entity_key) DO UPDATE SET dynamo_snapshot = EXCLUDED.dynamo_snapshot, postgres_snapshot = EXCLUDED.postgres_snapshot, last_synced_at = now()`,
        [conflict.entity_type, conflict.entity_key, JSON.stringify(resolution === 'dynamo' ? conflict.dynamo_value : conflict.postgres_value)]
      );
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to apply' };
    }
  }

  await pool.query('UPDATE bridge_conflicts SET resolved_at = now(), resolution = $2 WHERE id = $1', [id, resolution]);
  return { error: null };
}
