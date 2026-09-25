import { categoryBySlug } from '@/lib/judging';
import { getJudgeAssignment } from '@/lib/judging-queries';
import { ComingNext } from '@/app/judge/_components/ComingNext';
import { JudgeShell, NotJudging } from '@/app/judge/_components/JudgeShell';

const CATEGORY = categoryBySlug('difficulty')!;

export default async function DifficultyJudgePage({
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
  return (
    <JudgeShell category={CATEGORY} name={judge.name}>
      <ComingNext category={CATEGORY} eventId={eventId} playerId={playerId} tab={tab} />
    </JudgeShell>
  );
}
