import { JudgeShell } from '@/app/judge/_components/JudgeShell';
import { SimpleRankingJudge } from '@/app/judge/_components/SimpleRankingJudge';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SimpleRankingJudgePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!UUID.test(eventId)) {
    return (
      <JudgeShell>
        <p className="text-sm text-gray-500">Unknown event.</p>
      </JudgeShell>
    );
  }
  return (
    <JudgeShell>
      <SimpleRankingJudge eventId={eventId} />
    </JudgeShell>
  );
}
