import { categoryBySlug, noteCategoryOf, seatPath } from '@/lib/judging';
import { getJudgeState, getSeatHolder } from '@/lib/judging-queries';
import { JudgeShell, NotJudging } from './JudgeShell';
import { SeatJudge } from './SeatJudge';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A judging seat's page (see seatPath), shared by every category's route. The
// screen starts on whoever holds the seat now and follows the seat after that.
export async function SeatPage({
  slug,
  params,
  searchParams,
}: {
  slug: string;
  params: Promise<{ eventId: string; seat: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const category = categoryBySlug(slug)!;
  const noteCategory = noteCategoryOf(category.type);
  const { eventId, seat: seatText } = await params;
  const { tab } = await searchParams;
  const seat = Number(seatText);
  if (!noteCategory || !UUID.test(eventId) || !Number.isInteger(seat) || seat < 1) return <NotJudging />;

  const holder = await getSeatHolder(eventId, category.type, seat);
  const initial = holder ? { ...holder, initial: await getJudgeState(eventId, holder.playerId, category.type) } : null;
  return (
    <JudgeShell>
      <SeatJudge
        category={noteCategory}
        categoryLabel={category.label}
        eventId={eventId}
        seat={seat}
        basePath={seatPath(category, eventId, seat)}
        initialTab={tab === 'review' ? 'review' : 'play'}
        initial={initial}
      />
    </JudgeShell>
  );
}
