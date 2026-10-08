import Link from 'next/link';
import { requirePermission } from '@/lib/authz';
import type { Metadata } from 'next';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/data-bridge') };

export default async function DataBridgeLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('data_bridge');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/control-panel" className="mb-6 inline-block text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      {children}
    </div>
  );
}
