import { get } from '@vercel/blob';
import { auth } from '@/auth';
import { isTeamMusicFile } from '@/lib/team-music';

// Plays a team's uploaded MP3 (kept private in Vercel Blob) to a signed-in
// user: ?u=<the blob URL saved in team_music>. Only URLs saved there are
// served, so this never hands out other private blobs (backups). Passes the
// browser's Range through so the player can seek.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Sign in to play music.', { status: 401 });

  const url = new URL(request.url).searchParams.get('u');
  if (!url || !(await isTeamMusicFile(url))) return new Response('Not found', { status: 404 });

  const range = request.headers.get('range');
  const result = await get(url, { access: 'private', headers: range ? { range } : undefined });
  if (!result || !result.stream) return new Response('Not found', { status: 404 });

  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  });
  for (const name of ['content-length', 'content-range', 'etag']) {
    const value = result.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(result.stream, { status: headers.has('content-range') ? 206 : 200, headers });
}
