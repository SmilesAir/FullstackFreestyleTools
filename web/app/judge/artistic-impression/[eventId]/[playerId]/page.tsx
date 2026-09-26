import { categoryBySlug, judgePath } from '@/lib/judging';
import { getJudgeAssignment, getJudgeState } from '@/lib/judging-queries';
import { JudgeShell, NotJudging } from '@/app/judge/_components/JudgeShell';
import { NotesJudge } from '@/app/judge/_components/NotesJudge';

const CATEGORY = categoryBySlug('artistic-impression')!;

export default async function ArtisticImpressionJudgePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; playerId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { eventId, playerId } = await params;
  const { tab } = await searchParams;
  const judge = await getJudgeAssignment(eventId, playerId, CATEGORY);
  if (!judge) return <NotJudging />;

  const initial = await getJudgeState(eventId, playerId, CATEGORY.type);
  return (
    <JudgeShell>
      <NotesJudge
        category="AI"
        eventId={eventId}
        playerId={playerId}
        judgeName={judge.name}
        basePath={judgePath(CATEGORY, eventId, playerId)}
        initialTab={tab === 'review' ? 'review' : 'play'}
        initial={initial}
      />
    </JudgeShell>
  );
}
