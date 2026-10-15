import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { auth } from '@/auth';
import { ROUNDS } from '@/lib/event-creator';
import { ALL_ROUNDS, MAX_MUSIC_BYTES } from '@/lib/team-music-links';
import { teamMusicPathPrefix } from '@/lib/team-music';
import { checkMyTeam } from '@/lib/team-timecalls';

// Hands the browser a token to upload a team's MP3 straight to Vercel Blob
// (too big for a server action), once it is the player's own team and a round
// they can still set music for. The browser then saves it with
// setMyTeamMusicFile (lib/player-music-actions.ts).
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        if (!session?.user?.id) throw new Error('Sign in to upload music.');
        const { teamId, round } = JSON.parse(clientPayload ?? '{}') as { teamId?: unknown; round?: unknown };
        if (typeof teamId !== 'string' || typeof round !== 'number') throw new Error('Bad upload');
        if (round !== ALL_ROUNDS && !ROUNDS.some((r) => r.number === round)) throw new Error('Unknown round');
        const check = await checkMyTeam(teamId, session.user.id, round);
        if (check.error !== null) throw new Error(check.error);
        if (!pathname.startsWith(teamMusicPathPrefix(check.divisionId)) || !pathname.toLowerCase().endsWith('.mp3')) {
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
