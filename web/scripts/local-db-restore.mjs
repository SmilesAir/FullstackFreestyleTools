// Puts the local Postgres back to how it was in one of its safety backups (the
// files the local server writes to web/.local/backups before it overwrites
// anything). Stop the server first. Replaces everything the backup covers.
//   npm run local:restore                     lists the backups
//   npm run local:restore -- <file name>      restores one
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', '.local', 'backups');
dotenv.config({ path: path.join(here, '..', '.env.local'), quiet: true });

const wanted = process.argv[2];
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json.gz')).sort().reverse() : [];
if (!wanted) {
  console.log(files.length ? 'Local backups (newest first):' : 'There are no local backups yet.');
  for (const f of files) console.log('  ' + f);
  if (files.length) console.log('\nRestore one with: npm run local:restore -- <file name>');
  process.exit(0);
}

const url = process.env.LOCAL_DATABASE_URL;
if (!url) {
  console.error('LOCAL_DATABASE_URL is not set in web/.env.local.');
  process.exit(1);
}

// The tables a backup covers, parents first: read from the app's own list.
const source = fs.readFileSync(path.join(here, '..', 'lib', 'backup-tables.ts'), 'utf8');
const block = source.match(/BACKUP_TABLES = \[([\s\S]*?)\] as const/)?.[1] ?? '';
const tables = [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
if (tables.length === 0) {
  console.error("Couldn't read the table list from lib/backup-tables.ts.");
  process.exit(1);
}

const file = path.isAbsolute(wanted) ? wanted : path.join(dir, wanted);
if (!fs.existsSync(file)) {
  console.error(`No such backup: ${file}`);
  process.exit(1);
}
const doc = JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query('BEGIN');
  for (const table of [...tables].reverse()) await client.query(`DELETE FROM ${table}`);
  for (const table of tables) {
    const rows = doc.tables?.[table] ?? [];
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]);
    const perChunk = Math.max(1, Math.floor(1000 / columns.length));
    for (let i = 0; i < rows.length; i += perChunk) {
      const chunk = rows.slice(i, i + perChunk);
      const values = [];
      const placeholders = chunk.map((row, r) => {
        const cells = columns.map((col, c) => {
          values.push(row[col]);
          return `$${r * columns.length + c + 1}`;
        });
        return `(${cells.join(', ')})`;
      });
      await client.query(
        `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders.join(', ')}`,
        values
      );
    }
  }
  await client.query('COMMIT');
  console.log(`Restored the local database from ${path.basename(file)}.`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Restore failed, nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
