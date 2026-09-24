import 'dotenv/config';
import pg from 'pg';
import { loadData } from './lib/loadData.js';
import { insertPlayers } from './lib/insertPlayers.js';
import { insertEvents } from './lib/insertEvents.js';
import { insertResults } from './lib/insertResults.js';
import { insertResultTeams } from './lib/insertResultTeams.js';
import { insertRankings } from './lib/insertRankings.js';

const TABLES = ['players', 'events', 'divisions', 'teams', 'team_players', 'rankings', 'ranking_points'];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL. Copy .env.example to .env and fill in your Neon connection string.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const warnings = [];
  const summary = {};

  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    console.log('Loading JSON...');
    const { data, eventIds } = loadData();

    console.log('Inserting players...');
    const playersResult = await insertPlayers(client, { data }, warnings);
    summary.players = { inserted: playersResult.inserted, skipped: playersResult.skipped };

    console.log('Inserting events...');
    const eventsResult = await insertEvents(client, { data }, warnings);
    summary.events = { inserted: eventsResult.inserted, skipped: eventsResult.skipped };

    console.log('Inserting divisions...');
    const resultsResult = await insertResults(client, { data, eventIds }, warnings);
    summary.divisions = { inserted: resultsResult.inserted, skipped: resultsResult.skipped };

    console.log('Inserting result teams and team players...');
    const teamsResult = await insertResultTeams(
      client,
      { data, insertedResultIds: resultsResult.insertedIds, playerIdMap: playersResult.idMap },
      warnings
    );
    summary.teams = { inserted: teamsResult.teamsInserted };
    summary.team_players = { inserted: teamsResult.playersInserted };

    console.log('Inserting rankings and ranking points...');
    const rankingsResult = await insertRankings(
      client,
      { data, insertedResultIds: resultsResult.insertedIds, playerIdMap: playersResult.idMap },
      warnings
    );
    summary.rankings = { inserted: rankingsResult.rankingsInserted };
    summary.ranking_points = { inserted: rankingsResult.pointsInserted };

    await client.query('COMMIT');

    console.log('\n--- Migration summary ---');
    console.table(summary);

    if (warnings.length > 0) {
      console.log(`\n--- ${warnings.length} warning(s) ---`);
      for (const w of warnings) console.log(' -', w);
    }

    console.log('\nMigration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
