import { Suspense } from 'react';
import Link from 'next/link';
import { requirePermission } from '@/lib/authz';
import { DbStatus } from './_components/DbStatus';
import type { Metadata } from 'next';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/head-judge') };

export default async function HeadJudgeLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('head_judge');

  return (
    <div className="relative px-4 py-10">
      <div className="absolute right-4 top-10 z-30 flex items-center gap-4 text-sm leading-7">
        {/* Which database the server is on and its health, beside the way back. */}
        <Suspense fallback={null}>
          <DbStatus />
        </Suspense>
        <Link href="/control-panel" className="text-blue-600 underline">
          ← Control Panel
        </Link>
      </div>
      {children}
    </div>
  );
}
