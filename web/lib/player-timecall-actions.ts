'use server';

import { auth } from '@/auth';
import { cleanTimecalls } from './head-judge';
import { checkMyTeam, saveTeamTimecalls } from './team-timecalls';

export type TimecallActionResult = { error: string | null };

// A player sets their own team's time calls (seconds left when each is called
// out, 0 = "Time") from Player Activity. Only for a team they can change (see
// checkMyTeam). Saved to every pool of the team's still to come (see
// team-timecalls.ts).
export async function setMyTeamTimecalls(teamId: string, seconds: number[]): Promise<TimecallActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Sign in to set time calls.' };
  const values = cleanTimecalls(seconds);
  if (!values) return { error: 'Bad time call' };

  const check = await checkMyTeam(teamId, session.user.id);
  if (check.error !== null) return { error: check.error };

  await saveTeamTimecalls(teamId, values);
  return { error: null };
}
