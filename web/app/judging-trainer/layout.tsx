import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUserAccess } from '@/lib/authz';
import { isSupportChatAvailable } from '@/lib/support-chat-limits';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { SupportChat } from '../_components/SupportChat';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/judging-trainer') };
}

// Any signed-in user may practice; everything they do stays in their browser.
export default async function JudgingTrainerLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUserAccess())) redirect('/login');

  return (
    <>
      {children}
      {(await isSupportChatAvailable()) && <SupportChat page="judging-trainer" />}
    </>
  );
}
