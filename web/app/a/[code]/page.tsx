import type { Metadata } from 'next';
import { ANNOUNCER_CODE } from '@/lib/announcer';
import { resolveAnnouncerCode } from '@/lib/announcer-link';
import { getAnnouncerPoll } from '@/lib/announcer-queries';
import { getHeadJudgePools } from '@/lib/head-judge-queries';
import { AnnouncerShell } from '../_components/AnnouncerShell';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

// Unlisted: reached only through the link the Head Judge copies, never indexed.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).publicPages.announcerTitle, robots: { index: false, follow: false } };
}

async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">{t.publicPages.notFound}</h1>
      <p className="text-sm text-gray-500">{t.publicPages.announcerNotFound}</p>
    </main>
  );
}

// The Announcer: the pool on stage, its teams in play order with who is up,
// and the routine timer, read-only and with no sign-in. Team lists print with
// room for notes.
export default async function AnnouncerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const event = ANNOUNCER_CODE.test(code) ? await resolveAnnouncerCode(code) : null;
  if (!event) return <NotFound />;

  // Every division the Head Judge sees, hidden ones too: a hidden division is
  // kept off the public listings, but it still plays, and the announcer calls it.
  const [divisions, poll] = await Promise.all([getHeadJudgePools(event.eventId), getAnnouncerPoll(event.eventId)]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 print:max-w-none print:p-0">
      <AnnouncerShell code={code} eventName={event.eventName} divisions={divisions} initialPoll={poll} />
    </main>
  );
}
