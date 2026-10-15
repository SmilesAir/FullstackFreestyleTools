'use server';

import { auth } from '@/auth';
import { pool } from './db';
import { cleanTimecalls } from './head-judge';
import { POOL_LOCKED_ERROR } from './pool-locks';

export type TimecallActionResult = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A player sets their own team's time calls (seconds left when each is called
// out, 0 = "Time") from Player Activity. Only for a team they are on (their
// linked player or one of its aliases), in a pool that has no results yet, isn't
// locked, and before the team has played (a running or finished routine).
export async function setMyTeamTimecalls(teamId: string, seconds: number[]): Promise<TimecallActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Sign in to set time calls.' };
  if (!UUID.test(teamId)) return { error: 'Unknown team' };
  const values = cleanTimecalls(seconds);
  if (!values) return { error: 'Bad time call' };

  const found = await pool.query<{ mine: boolean; has_results: boolean; locked: boolean; played: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM team_players tp JOIN players p ON p.id = tp.player_id
               WHERE tp.team_id = t.id AND u.player_id IS NOT NULL
                 AND (p.id = u.player_id OR p.alias_id = u.player_id)) AS mine,
       EXISTS (SELECT 1 FROM teams o
               WHERE o.division_id = t.division_id AND o.round_number = t.round_number
                 AND o.pool_id = t.pool_id AND o.place IS NOT NULL) AS has_results,
       COALESCE((SELECT po.locked FROM pools po
                 WHERE po.division_id = t.division_id AND po.round_number = t.round_number
                   AND po.pool_id = t.pool_id), false) AS locked,
       EXISTS (SELECT 1 FROM routines r WHERE r.team_id = t.id AND r.status <> 'cancelled') AS played
     FROM teams t, users u
     WHERE t.id = $1 AND t.round_number >= 1 AND u.id = $2`,
    [teamId, session.user.id]
  );
  const row = found.rows[0];
  if (!row || !row.mine) return { error: "You can only set time calls for your own team." };
  if (row.locked) return { error: POOL_LOCKED_ERROR };
  if (row.has_results || row.played) return { error: 'This team has already played.' };

  await pool.query('UPDATE teams SET timecalls = $2 WHERE id = $1', [teamId, values]);
  return { error: null };
}
