// Applies backend/schema.sql to the local Postgres (LOCAL_DATABASE_URL in
// .env.local), creating every table the app needs. Safe to run again: the
// schema is idempotent. Run with: npm run local:setup
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env.local'), quiet: true });

const url = process.env.LOCAL_DATABASE_URL;
if (!url) {
  console.error('LOCAL_DATABASE_URL is not set. Put it in web/.env.local, e.g.');
  console.error('  LOCAL_DATABASE_URL=postgresql://postgres:password@localhost:5432/freestyle_local');
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
  console.log(`The local database is ready (${tables.rows[0].n} tables).`);
} catch (err) {
  console.error('Could not set up the local database:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
