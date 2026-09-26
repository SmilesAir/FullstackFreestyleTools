import { getMode } from '@/lib/db-mode';
import { categoryByType } from '@/lib/judging';
import { getSeatHolder } from '@/lib/judging-queries';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Who holds a judging seat now (see seatPath), polled by a seat's screen so it
// can switch judges when the pool changes. Public on purpose, like
// /api/judge/state: it only returns a name the main page already shows.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get('event') ?? '';
  const category = params.get('category') ?? '';
  const seat = Number(params.get('seat'));
  if (!UUID.test(eventId) || !categoryByType(category) || !Number.isInteger(seat) || seat < 1) {
    return Response.json({ error: 'Missing or invalid event, category or seat' }, { status: 400 });
  }

  try {
    return Response.json({ holder: await getSeatHolder(eventId, category, seat), mode: getMode() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // The database being unreachable.
    return Response.json({ error: 'Could not read the seat' }, { status: 500 });
  }
}
