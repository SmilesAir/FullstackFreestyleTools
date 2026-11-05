import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUserAccess } from '@/lib/authz';
import { getPoolReviewScope, hasPoolReviewAccess } from '@/lib/pool-review-queries';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/pool-review') };
}

// Open to anyone the pool_review permission, a committee or a directorship
// reaches (see getPoolReviewScope), not only to the permission.
export default async function PoolReviewLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');
  if (!hasPoolReviewAccess(await getPoolReviewScope(access))) redirect('/no-access');
  const t = await getT();

  return (
    <div className="relative px-4 py-10">
      <ControlPanelLink label={t.headJudge.backToControlPanel} className="absolute right-4 top-10 leading-7" linkClassName="text-sm text-blue-600 underline" />
      {children}
    </div>
  );
}
