import format from 'pg-format';

const CHUNK_SIZE = 500;

/**
 * Bulk-inserts rows using multi-row VALUES statements, chunked to keep
 * each statement well under Postgres's parameter/row limits.
 */
export async function batchInsert(client, table, columns, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const sql = format('INSERT INTO %I (%I) VALUES %L', table, columns, chunk);
    await client.query(sql);
    inserted += chunk.length;
  }
  return inserted;
}
