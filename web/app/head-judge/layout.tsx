import Link from 'next/link';
import { requirePermission } from '@/lib/authz';

export default async function HeadJudgeLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('head_judge');

  return (
    <div className="relative px-4 py-10">
      <Link href="/control-panel" className="absolute right-4 top-10 text-sm leading-7 text-blue-600 underline">
        ← Control Panel
      </Link>
      {children}
    </div>
  );
}
