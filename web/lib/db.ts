import 'server-only';
import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    // Opening a connection to Neon costs several round trips (~0.9s from a dev
    // machine) versus ~0.12s for a query on an open one, so keep idle ones for
    // a while. Kept short of Neon's own idle cut-off, which drops quiet
    // connections from its side.
    idleTimeoutMillis: 60 * 1000,
    keepAlive: true,
  });

  // Neon can still close an idle connection from the server side. pg forwards
  // that as a pool 'error' event, and an unhandled one crashes the process.
  // The dead client is already discarded; the next query just opens a new one.
  pool.on('error', (err) => {
    console.warn('Postgres: idle connection dropped by the server, will reconnect:', err.message);
  });

  return pool;
}

export const pool = globalForPg.pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}
