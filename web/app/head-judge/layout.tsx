import { Suspense } from 'react';
import { requirePermission } from '@/lib/authz';
import { isSupportChatAvailable } from '@/lib/support-chat-limits';
import { SupportChat } from '../_components/SupportChat';
import { DbStatus } from './_components/DbStatus';
import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/head-judge') };
}

export default async function HeadJudgeLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('head_judge');
  const t = await getT();

  return (
    <div className="relative px-4 py-10">
      <div className="absolute right-4 top-10 z-30 flex items-center gap-4 text-sm leading-7">
        {/* Which database the server is on and its health, beside the way back. */}
        <Suspense fallback={null}>
          <DbStatus />
        </Suspense>
        <ControlPanelLink label={t.headJudge.backToControlPanel} />
      </div>
      {children}
      {(await isSupportChatAvailable()) && <SupportChat page="head-judge" />}
    </div>
  );
}
