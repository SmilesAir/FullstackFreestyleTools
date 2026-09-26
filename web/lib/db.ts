import 'server-only';
import { Pool } from 'pg';
import { getMode } from './db-mode';

// Two databases can be behind `pool`: Neon ('remote', DATABASE_URL) and the
// Postgres on the head judge's laptop ('local', LOCAL_DATABASE_URL). `pool` is
// a thin stand-in that hands every call to whichever is active (see db-mode.ts),
// so the code that uses it doesn't know there are two. A query or transaction
// already under way finishes on the pool it started on.
type PoolKind = 'remote' | 'local';

const globalForPg = globalThis as unknown as { pgPools?: Partial<Record<PoolKind, Pool>> };

function createPool(kind: PoolKind) {
  const isLocal = kind === 'local';
  const pool = new Pool({
    connectionString: isLocal ? process.env.LOCAL_DATABASE_URL : process.env.DATABASE_URL,
    max: 12,
    // Opening a connection to Neon costs several round trips (~0.9s from a dev
    // machine) versus ~0.12s for a query on an open one, so keep idle ones for
    // a while. Kept short of Neon's own idle cut-off, which drops quiet
    // connections from its side.
    idleTimeoutMillis: 60 * 1000,
    keepAlive: true,
    // A dead link should fail in seconds, not hang a screen (or a sync).
    connectionTimeoutMillis: isLocal ? 3000 : 10000,
  });

  // Neon can still close an idle connection from the server side. pg forwards
  // that as a pool 'error' event, and an unhandled one crashes the process.
  // The dead client is already discarded; the next query just opens a new one.
  pool.on('error', (err) => {
    console.warn(`Postgres (${kind}): idle connection dropped by the server, will reconnect:`, err.message);
  });

  return pool;
}

// A specific database, whatever the mode (the sync and the pings use these).
export function getPool(kind: PoolKind): Pool {
  const pools = (globalForPg.pgPools ??= {});
  return (pools[kind] ??= createPool(kind));
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const active = getPool(getMode());
    const value = Reflect.get(active, prop, active);
    return typeof value === 'function' ? value.bind(active) : value;
  },
});
