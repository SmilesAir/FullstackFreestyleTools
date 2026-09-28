// Applies backend/schema.sql to the remote database (DATABASE_URL in .env.local) -
// the counterpart to local-db-setup.mjs, which does the same for the local Postgres.
// Safe to run again: the schema is idempotent (CREATE TABLE IF NOT EXISTS, ADD COLUMN
// IF NOT EXISTS everywhere). Run with: npm run remote:setup
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env.local'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL found. Put the Neon connection string in web/.env.local, e.g.');
  console.error('  DATABASE_URL=postgresql://user:pass@host/neondb?sslmode=require');
  process.exit(1);
}

const schema = fs.readFileSync(path.join(here, '..', '..', 'backend', 'schema.sql'), 'utf8');
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query(schema);
  const tables = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
  );
  const bridge = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('bridge_sync_state', 'bridge_conflicts')`
  );
  console.log(`The remote database is up to date (${tables.rows[0].n} tables, bridge tables present: ${bridge.rows[0].n}/2).`);
} catch (err) {
  console.error('Could not update the remote database:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
