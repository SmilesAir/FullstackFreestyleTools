// Copies who judged each pool in the old FPA Judging System (its DynamoDB table,
// freestyle-judge-production-dataTable: each pool|<event>|<division>|<round>|<letter>
// item's `judges` map of player id -> category) into pool_judges. The data
// migration's JSON export never had judges, so without this every judge's history
// starts at whatever they judged in this app.
//
// Categories are stored exactly as the old system had them (Diff, ExAi, Variety,
// GoeDiff, ...). A pool that already has pool_judges rows is left alone (those are
// this app's own assignments), so running this again is harmless.
//   node scripts/import-legacy-judges.mjs           dry run: what would be imported
//   node scripts/import-legacy-judges.mjs --apply   import (one transaction, DATABASE_URL)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env.local'), quiet: true });

const apply = process.argv.includes('--apply');
const TABLE_NAME = 'freestyle-judge-production-dataTable';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// web/lib/event-creator.ts ROUNDS
const ROUND_NUMBERS = { Finals: 1, Semifinals: 2, Quarterfinals: 3, Preliminaries: 4 };

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.BRIDGE_AWS_REGION || 'us-west-2' }));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function scanPools() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.filter((i) => String(i.key).startsWith('pool|') && i.judges && Object.keys(i.judges).length > 0);
}

async function main() {
  const pools = await scanPools();
  await db.connect();

  // One pg.Client runs one query at a time, so these go in turn.
  const events = await db.query('SELECT id, event_name FROM events');
  const divisions = await db.query('SELECT d.id, d.event_id, d.division_name, e.event_name FROM divisions d JOIN events e ON e.id = d.event_id');
  const players = await db.query('SELECT id FROM players');
  const existing = await db.query('SELECT DISTINCT division_id, round_number, pool_id FROM pool_judges');
  const teams = await db.query('SELECT DISTINCT division_id, round_number, pool_id FROM teams');
  const eventName = new Map(events.rows.map((e) => [e.id, e.event_name]));
  const divisionOf = new Map(divisions.rows.map((d) => [`${d.event_id}|${d.division_name}`, d]));
  const playerIds = new Set(players.rows.map((p) => p.id));
  const poolKey = (r) => `${r.division_id}|${r.round_number}|${r.pool_id}`;
  const judged = new Set(existing.rows.map(poolKey));
  const withTeams = new Set(teams.rows.map(poolKey));

  const rows = [];
  const skipped = [];
  const perEvent = new Map();
  for (const item of pools) {
    const [, eventId, divisionName, roundName, letter] = String(item.key).split('|');
    const skip = (reason) => skipped.push(`${item.key}: ${reason}`);
    if (!UUID.test(eventId)) {
      skip('no event id');
      continue;
    }
    const division = divisionOf.get(`${eventId}|${divisionName}`);
    if (!division) {
      skip(`${eventName.get(eventId) ?? 'unknown event'}: no ${divisionName} division in Postgres`);
      continue;
    }
    const roundNumber = ROUND_NUMBERS[roundName];
    if (!roundNumber) {
      skip(`unknown round "${roundName}"`);
      continue;
    }
    const target = { division_id: division.id, round_number: roundNumber, pool_id: `pool${letter}` };
    if (!withTeams.has(poolKey(target))) {
      skip(`${division.event_name}: pool has no teams in Postgres`);
      continue;
    }
    if (judged.has(poolKey(target))) {
      skip(`${division.event_name}: pool already has judges`);
      continue;
    }
    let added = 0;
    for (const [playerId, category] of Object.entries(item.judges)) {
      if (!playerIds.has(playerId)) {
        skip(`judge ${playerId} is not a player`);
        continue;
      }
      rows.push({ ...target, player_id: playerId, category_type: String(category) });
      added++;
    }
    if (added > 0) {
      const e = perEvent.get(division.event_name) ?? { pools: 0, judges: 0 };
      perEvent.set(division.event_name, { pools: e.pools + 1, judges: e.judges + added });
    }
  }

  console.log(`Old system: ${pools.length} pools with judges.`);
  console.log('\nTo import, per event:');
  for (const [name, c] of [...perEvent.entries()].sort()) console.log(`  ${name}: ${c.pools} pools, ${c.judges} judges`);
  console.log(`\nSkipped (${skipped.length}):`);
  for (const s of skipped) console.log('  ' + s);
  console.log(`\nTotal: ${rows.length} pool_judges rows in ${[...perEvent.values()].reduce((n, c) => n + c.pools, 0)} pools.`);

  if (!apply) {
    console.log('\nDry run - nothing written. Run with --apply to import.');
    return;
  }

  await db.query('BEGIN');
  try {
    let inserted = 0;
    for (const r of rows) {
      const result = await db.query(
        `INSERT INTO pool_judges (division_id, round_number, pool_id, player_id, category_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (division_id, round_number, pool_id, player_id) DO NOTHING`,
        [r.division_id, r.round_number, r.pool_id, r.player_id, r.category_type]
      );
      inserted += result.rowCount;
    }
    await db.query('COMMIT');
    console.log(`\nImported ${inserted} pool_judges rows.`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.end());
