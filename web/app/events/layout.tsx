import Link from 'next/link';
import { requirePermission } from '@/lib/authz';

export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('event_creator');

  return (
    <div className="px-4 py-10">
      <Link href="/control-panel" className="mb-6 inline-block text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      {children}
    </div>
  );
}
