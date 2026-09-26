import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';
import type { Metadata } from 'next';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/backups') };

export default async function BackupsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/control-panel" className="mb-6 inline-block text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      {children}
    </div>
  );
}
