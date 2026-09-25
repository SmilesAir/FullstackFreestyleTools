import { categoryBySlug, judgePath } from '@/lib/judging';
import { getJudgeAssignment, getJudgeState } from '@/lib/judging-queries';
import { JudgeShell, NotJudging } from '@/app/judge/_components/JudgeShell';
import { ExecutionJudge } from '../../_components/ExecutionJudge';

const CATEGORY = categoryBySlug('execution')!;

export default async function ExecutionJudgePage({
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
    <JudgeShell category={CATEGORY} name={judge.name}>
      <ExecutionJudge
        eventId={eventId}
        playerId={playerId}
        basePath={judgePath(CATEGORY, eventId, playerId)}
        initialTab={tab === 'review' ? 'review' : 'play'}
        initial={initial}
      />
    </JudgeShell>
  );
}
