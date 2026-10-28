import { categoryBySlug, judgePath } from '@/lib/judging';
import { judgePinOk } from '@/lib/judge-pin';
import { getJudgeAssignment, getJudgeState } from '@/lib/judging-queries';
import { JudgeShell, NotJudging } from '@/app/judge/_components/JudgeShell';
import { NotesJudge } from '@/app/judge/_components/NotesJudge';
import { PinPad } from '@/app/judge/_components/PinPad';

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
  const [judge, pinOk] = await Promise.all([getJudgeAssignment(eventId, playerId, CATEGORY), judgePinOk(eventId)]);
  if (!judge) return <NotJudging />;
  // The judge is picked; now the event's PIN (once per device).
  if (!pinOk) {
    return (
      <JudgeShell>
        <PinPad eventId={eventId} judgeName={judge.name} categoryLabel={CATEGORY.label} />
      </JudgeShell>
    );
  }

  const initial = await getJudgeState(eventId, playerId, CATEGORY.type);
  return (
    <JudgeShell>
      <NotesJudge
        category="Diff"
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
