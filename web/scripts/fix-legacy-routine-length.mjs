// Corrects team scores the old FPA Judging System saved with the wrong routine length.
// Its lockAndCalcPoolResults built each judge's score from getSelectedPoolRoutineSeconds()
// - the division/round the head judge had selected in the UI, not the pool being locked -
// until FreestyleJudge 429cbd5 (2026-08-10). So e.g. DM26's 180s pairs finals were saved
// scored as 240s routines (Co-op was selected), which reorders places. The old results page
// recomputes from judgeData and shows the right order; the stored teamScore (and so this
// app's teams.points/place, copied from it) is wrong.
//
// For every locked Fpa2020 pool in freestyle-judge-production-dataTable this recomputes each
// team from its judges' rawScores (the old client's formulas and default constants, ported
// below) at the round's real lengthSeconds. A pool is only corrected when its stored scores
// are reproduced exactly at some *other* length - proof the bug is what happened - and when
// Postgres still holds those same stored scores. Anything else is reported and left alone.
//   node scripts/fix-legacy-routine-length.mjs           dry run: what would change
//   node scripts/fix-legacy-routine-length.mjs --apply   update teams (one transaction, DATABASE_URL)
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
// web/lib/event-creator.ts ROUNDS
const ROUND_NUMBERS = { Finals: 1, Semifinals: 2, Quarterfinals: 3, Preliminaries: 4 };
const FPA_CATEGORIES = ['Diff', 'ExAi', 'Variety'];
const MATCH = 1e-6;

// FreestyleJudge client/source judgeDataDiff.js / judgeDataVariety.js / judgeDataExAi.js /
// judgeDataFpaBase.js, default constants.
const EPSILON = 0.01;
const DIFF_GRADIENT = [
  { s: 0, e: 4 / 60, sY: 1, eY: 1 },
  { s: 4 / 60, e: 8 / 60, sY: 0.3, eY: 0.1 },
  { s: 8 / 60, e: 16 / 60, sY: 0.1, eY: 0 },
  { s: 0, e: Infinity, sY: 0, eY: 0 },
];

function diffScore(diffScores, seconds) {
  const sorted = [...diffScores].sort((a, b) => b - a);
  let total = 0;
  sorted.forEach((score, i) => {
    for (const line of DIFF_GRADIENT) {
      const sX = line.s * seconds - EPSILON;
      const eX = line.e * seconds - EPSILON;
      if (i >= sX && i < eX) {
        const gradient = line.sY + ((line.eY - line.sY) / (eX - sX)) * (i - sX);
        total += Math.pow(Math.max(0, score), 1.5) * 0.5 * gradient;
        break;
      }
    }
  });
  return (total / ((4 / 60) * seconds)) * 2;
}

function exScaler(phraseCount, seconds) {
  const start = seconds * 0.08;
  const end = seconds * 0.333;
  const delta = end - start;
  if (phraseCount <= start) return 1;
  return Math.max(Math.pow((delta - Math.max(0, Math.min(end, phraseCount - start) / 0.5)) / delta, 2), 0.5);
}

function teamScore(judges, teamData, seconds) {
  const counts = Object.values(teamData.judgeData ?? {})
    .filter((j) => j.categoryType === 'Diff')
    .map((j) => (j.rawScores?.diffScores ?? []).length);
  const phraseCount = counts.reduce((a, b) => a + b, 0) / counts.length;
  let score = 0;
  for (const [judgeKey, category] of Object.entries(judges)) {
    const judge = teamData.judgeData?.[judgeKey];
    if (!judge) continue;
    const r = judge.rawScores ?? {};
    const n = (k) => r[k] || 0;
    score += n('general') * 0.25;
    if (category === 'Diff') score += diffScore(r.diffScores ?? [], seconds);
    if (category === 'Variety') score += ((n('quality') * n('quantity')) / (seconds * 0.25)) * 2;
    if (category === 'ExAi') {
      score += ((n('music') + n('teamwork') + n('form')) / 3) * 2;
      const exRaw = -(n('point1') * 0.1 + n('point2') * 0.2 + n('point3') * 0.3) * 3;
      score += counts.length ? exRaw * exScaler(phraseCount, seconds) : 0;
    }
  }
  return score;
}

// Equal scores share a place, the next distinct score skips ahead (1, 2, 2, 4) - same as
// web/lib/bridge/mapping.ts dynamoPoolResultToCanonical.
function places(scores) {
  const ranked = scores.map((score, i) => ({ score, i })).sort((a, b) => b.score - a.score);
  const out = new Array(scores.length);
  let place = 1;
  ranked.forEach((r, k) => {
    if (k > 0 && r.score !== ranked[k - 1].score) place = k + 1;
    out[r.i] = place;
  });
  return out;
}

const teamKey = (ids) => [...ids].map(String).sort().join(',');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.BRIDGE_AWS_REGION || 'us-west-2' }));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function scanAll() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  const items = await scanAll();
  await db.connect();

  const events = new Map(items.filter((i) => i.eventData).map((i) => [i.key, i]));
  const divisions = await db.query('SELECT id, event_id, division_name FROM divisions');
  const divisionOf = new Map(divisions.rows.map((d) => [`${d.event_id}|${d.division_name}`, d.id]));
  const teams = await db.query(
    `SELECT t.id, t.division_id, t.round_number, t.pool_id, t.place, t.points,
            array_agg(tp.player_id::text) AS player_ids,
            string_agg(coalesce(p.first_name || ' ' || p.last_name, tp.player_id::text), ' & ' ORDER BY tp.id) AS names
     FROM teams t JOIN team_players tp ON tp.team_id = t.id LEFT JOIN players p ON p.id = tp.player_id
     GROUP BY t.id`
  );
  const teamsByPool = new Map();
  for (const t of teams.rows) {
    const k = `${t.division_id}|${t.round_number}|${t.pool_id}`;
    if (!teamsByPool.has(k)) teamsByPool.set(k, new Map());
    teamsByPool.get(k).set(teamKey(t.player_ids), t);
  }

  const updates = [];
  const skipped = [];
  let alreadyRight = 0;
  for (const item of items) {
    if (!String(item.key).startsWith('pool|') || !item.isLocked) continue;
    const categories = Object.values(item.judges ?? {});
    if (categories.length === 0 || !categories.every((c) => FPA_CATEGORIES.includes(c))) continue;
    const [, eventId, divisionName, roundName, letter] = String(item.key).split('|');
    const event = events.get(eventId);
    const label = `${event?.eventName ?? eventId} / ${divisionName} / ${roundName} ${letter}`;
    const skip = (reason) => skipped.push(`${label}: ${reason}`);
    const divisionData = event?.eventData?.divisionData ?? {};
    const seconds = divisionData[divisionName]?.roundData?.[roundName]?.lengthSeconds;
    if (!seconds) {
      skip('no routine length');
      continue;
    }

    const teamData = item.teamData ?? [];
    const stored = teamData.map((t) => Number(t.teamScore));
    const reproduces = (s) => teamData.every((t, i) => Math.abs(teamScore(item.judges, t, s) - stored[i]) < MATCH);
    if (reproduces(seconds)) {
      alreadyRight++;
      continue;
    }
    // Lengths a head judge could have had selected: this event's rounds first, then any.
    const candidates = new Set();
    for (const d of Object.values(divisionData)) for (const r of Object.values(d.roundData ?? {})) if (r.lengthSeconds) candidates.add(r.lengthSeconds);
    for (let s = 30; s <= 600; s++) candidates.add(s);
    const savedAt = [...candidates].find((s) => s !== seconds && reproduces(s));
    if (savedAt === undefined) {
      skip(`stored scores aren't reproduced at any routine length - left alone`);
      continue;
    }

    const divisionId = divisionOf.get(`${eventId}|${divisionName}`);
    const roundNumber = ROUND_NUMBERS[roundName];
    const pgTeams = divisionId && roundNumber ? teamsByPool.get(`${divisionId}|${roundNumber}|pool${letter}`) : undefined;
    if (!pgTeams) {
      skip('not in Postgres');
      continue;
    }
    const matched = teamData.map((t) => pgTeams.get(teamKey(t.players ?? [])));
    if (matched.some((t) => !t) || matched.length !== pgTeams.size) {
      skip("Postgres teams don't match the Dynamo pool");
      continue;
    }
    if (matched.some((t, i) => t.points === null || Math.abs(Number(t.points) - stored[i]) > MATCH)) {
      skip('Postgres points differ from the stored Dynamo scores (changed since import?) - left alone');
      continue;
    }

    const correct = teamData.map((t) => teamScore(item.judges, t, seconds));
    const correctPlaces = places(correct);
    const rows = matched.map((t, i) => ({ id: t.id, names: t.names, oldPlace: t.place, oldPoints: Number(t.points), place: correctPlaces[i], points: correct[i] }));
    rows.sort((a, b) => a.place - b.place);
    updates.push({ label, seconds, savedAt, reordered: rows.some((r) => r.place !== r.oldPlace), rows });
  }

  for (const u of updates) {
    console.log(`\n${u.label}  (${u.seconds}s, saved as ${u.savedAt}s)${u.reordered ? '  PLACES CHANGE' : ''}`);
    for (const r of u.rows) {
      const moved = r.place !== r.oldPlace ? `  (was ${r.oldPlace})` : '';
      console.log(`  ${String(r.place).padStart(2)}. ${r.names.padEnd(45)} ${r.oldPoints.toFixed(2).padStart(7)} -> ${r.points.toFixed(2).padStart(7)}${moved}`);
    }
  }
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  console.log(
    `\n${updates.length} pools to correct (${updates.filter((u) => u.reordered).length} with places changing), ${alreadyRight} already right, ${skipped.length} skipped.`
  );

  if (!apply) {
    console.log('Dry run - nothing written. Run with --apply to update teams.');
  } else if (updates.length) {
    await db.query('BEGIN');
    try {
      for (const u of updates) for (const r of u.rows) await db.query('UPDATE teams SET place = $2, points = $3 WHERE id = $1', [r.id, r.place, r.points]);
      await db.query('COMMIT');
      console.log(`Updated ${updates.reduce((n, u) => n + u.rows.length, 0)} teams.`);
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
