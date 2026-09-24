import 'server-only';
import { gzipSync, gunzipSync } from 'node:zlib';
import { put, del, get } from '@vercel/blob';
import { pool } from './db';
import { BACKUP_TABLES, TABLES_ADDED_LATER, type BackupTableName } from './backup-tables';

type BackupDocument = {
  version: 1;
  createdAt: string;
  tables: Record<BackupTableName, Record<string, unknown>[]>;
};

export type BackupKind = 'manual' | 'automatic' | 'uploaded' | 'pre_restore';

async function dumpDatabase(): Promise<Buffer> {
  const tables = {} as BackupDocument['tables'];

  for (const table of BACKUP_TABLES) {
    const result = await pool.query(`SELECT * FROM ${table}`);
    tables[table] = result.rows;
  }

  const doc: BackupDocument = { version: 1, createdAt: new Date().toISOString(), tables };
  return gzipSync(Buffer.from(JSON.stringify(doc)));
}

function parseBackupBuffer(buf: Buffer): BackupDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(gunzipSync(buf).toString('utf8'));
  } catch {
    throw new Error("That doesn't look like a valid backup file (couldn't decompress/parse it).");
  }

  if (
    typeof doc !== 'object' ||
    doc === null ||
    (doc as { version?: unknown }).version !== 1 ||
    typeof (doc as { tables?: unknown }).tables !== 'object'
  ) {
    throw new Error('Not a recognized backup format (missing version/tables).');
  }

  const tables = (doc as BackupDocument).tables;
  for (const table of BACKUP_TABLES) {
    if (Array.isArray(tables[table])) continue;
    if (TABLES_ADDED_LATER.includes(table) && tables[table] === undefined) {
      tables[table] = [];
      continue;
    }
    throw new Error(`Backup is missing the "${table}" table — refusing to restore a partial backup.`);
  }

  return doc as BackupDocument;
}

export async function createBackup(kind: BackupKind): Promise<void> {
  const buffer = await dumpDatabase();
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;

  const blob = await put(filename, buffer, {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/gzip',
  });

  await pool.query(
    `INSERT INTO backups (filename, blob_url, size_bytes, kind) VALUES ($1, $2, $3, $4)`,
    [filename, blob.url, buffer.length, kind]
  );
}

async function insertRows(client: import('pg').PoolClient, table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const rowsPerChunk = Math.max(1, Math.floor(1000 / columns.length));

  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    const values: unknown[] = [];
    const rowPlaceholders = chunk.map((row, rowIdx) => {
      const cols = columns.map((col, colIdx) => {
        values.push(row[col]);
        return `$${rowIdx * columns.length + colIdx + 1}`;
      });
      return `(${cols.join(', ')})`;
    });

    await client.query(
      `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${rowPlaceholders.join(', ')}`,
      values
    );
  }
}

export async function restoreFromBuffer(buf: Buffer): Promise<void> {
  const doc = parseBackupBuffer(buf);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const table of [...BACKUP_TABLES].reverse()) {
      await client.query(`DELETE FROM ${table}`);
    }
    for (const table of BACKUP_TABLES) {
      await insertRows(client, table, doc.tables[table]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function fetchBackupBuffer(blobUrl: string): Promise<Buffer> {
  const result = await get(blobUrl, { access: 'private' });
  if (!result) throw new Error('Failed to fetch backup from storage.');
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export function validateBackupBuffer(buf: Buffer): void {
  parseBackupBuffer(buf);
}

export async function deleteBackupBlob(blobUrl: string): Promise<void> {
  await del(blobUrl);
}
