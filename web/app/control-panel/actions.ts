'use server';

import { getCurrentUserAccess } from '@/lib/authz';
import { pool } from '@/lib/db';
import { isToolKey } from '@/lib/tools';

// Stars or unstars a Control Panel tool on the signed-in account (users.starred_tools).
// One statement each way, so quick clicks on different tools can't overwrite each other.
export async function setToolStarred(key: string, starred: boolean): Promise<{ ok: boolean }> {
  const access = await getCurrentUserAccess();
  if (!access || !isToolKey(key)) return { ok: false };
  try {
    await pool.query(
      starred
        ? 'UPDATE users SET starred_tools = array_append(array_remove(starred_tools, $1), $1) WHERE id = $2'
        : 'UPDATE users SET starred_tools = array_remove(starred_tools, $1) WHERE id = $2',
      [key, access.userId]
    );
    return { ok: true };
  } catch (err) {
    // e.g. a laptop's local copy predates the column (backend/schema.sql not re-run).
    console.error('Could not save the starred tool', err);
    return { ok: false };
  }
}
