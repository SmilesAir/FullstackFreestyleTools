import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/auth';
import { getCurrentUserAccess } from '@/lib/authz';
import { MAX_MUSIC_BYTES, isMusicRound } from '@/lib/team-music-links';
import { getTeamKey, teamMusicPathPrefix } from '@/lib/team-music';
import { checkMyTeam } from '@/lib/team-timecalls';

// Hands the browser a token to upload a team's MP3 straight to Vercel Blob
// (too big for a server action), once it is the player's own team and a round
// they can still set music for (or, from the Event Music tool, any team for a
// user with that permission). The browser then saves it with
// setMyTeamMusicFile (lib/player-music-actions.ts) or setEventTeamMusicFile
// (lib/event-music-actions.ts).
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { teamId, round, as } = JSON.parse(clientPayload ?? '{}') as { teamId?: unknown; round?: unknown; as?: unknown };
        if (typeof teamId !== 'string' || typeof round !== 'number') throw new Error('Bad upload');
        if (!isMusicRound(round)) throw new Error('Unknown round');
        let divisionId: string;
        if (as === 'event-music') {
          // The Event Music tool: any team, any round.
          const access = await getCurrentUserAccess();
          if (!access) throw new Error('Sign in to upload music.');
          if (!access.isAdmin && !access.permissions.has('event_music')) throw new Error('No access');
          const team = await getTeamKey(teamId);
          if (!team) throw new Error('Unknown team');
          divisionId = team.divisionId;
        } else {
          const session = await auth();
          if (!session?.user?.id) throw new Error('Sign in to upload music.');
          const check = await checkMyTeam(teamId, session.user.id, round);
          if (check.error !== null) throw new Error(check.error);
          divisionId = check.divisionId;
        }
        if (!pathname.startsWith(teamMusicPathPrefix(divisionId)) || !pathname.toLowerCase().endsWith('.mp3')) {
          throw new Error('Bad upload');
        }
        return {
          allowedContentTypes: ['audio/mpeg'],
          maximumSizeInBytes: MAX_MUSIC_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 400 });
  }
}
