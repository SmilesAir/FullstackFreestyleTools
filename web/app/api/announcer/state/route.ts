import { ANNOUNCER_CODE } from '@/lib/announcer';
import { resolveAnnouncerCode } from '@/lib/announcer-link';
import { getAnnouncerPoll } from '@/lib/announcer-queries';

// Who is up and the routine timer, polled by the Announcer page. Public on
// purpose (the announcer doesn't log in): the code is the event's unlisted
// Announcer link, and the answer is only what that page already shows. /api
// isn't behind the login proxy.
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code') ?? '';
  if (!ANNOUNCER_CODE.test(code)) return Response.json({ error: 'Missing or invalid code' }, { status: 400 });

  try {
    const event = await resolveAnnouncerCode(code);
    if (!event) return Response.json({ error: 'Unknown code' }, { status: 404 });
    return Response.json(await getAnnouncerPoll(event.eventId), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the state' }, { status: 500 });
  }
}
