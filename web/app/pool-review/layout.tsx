import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUserAccess } from '@/lib/authz';
import { getPoolReviewScope, hasPoolReviewAccess } from '@/lib/pool-review-queries';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/pool-review') };

// Open to anyone the pool_review permission, a committee or a directorship
// reaches (see getPoolReviewScope), not only to the permission.
export default async function PoolReviewLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');
  if (!hasPoolReviewAccess(await getPoolReviewScope(access))) redirect('/no-access');

  return (
    <div className="relative px-4 py-10">
      <Link href="/control-panel" className="absolute right-4 top-10 text-sm leading-7 text-blue-600 underline">
        ← Control Panel
      </Link>
      {children}
    </div>
  );
}
