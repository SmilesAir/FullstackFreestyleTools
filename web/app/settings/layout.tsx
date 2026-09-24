import Link from 'next/link';
import { requireAdmin } from '@/lib/authz';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/control-panel" className="mb-6 inline-block text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      {children}
    </div>
  );
}
