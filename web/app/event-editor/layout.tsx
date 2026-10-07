import Link from 'next/link';
import { requirePermission } from '@/lib/authz';
import type { Metadata } from 'next';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/event-editor') };

export default async function EventEditorLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('event_editor');

  return (
    <div className="relative px-4 py-10">
      <Link href="/control-panel" className="absolute right-4 top-10 text-sm leading-7 text-blue-600 underline">
        ← Control Panel
      </Link>
      {children}
    </div>
  );
}
