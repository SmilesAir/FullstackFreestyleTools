import Link from 'next/link';
import { PlayerListPanel } from './_components/PlayerListPanel';
import { AliasPickerProvider } from './_components/AliasPickerContext';
import { requirePermission } from '@/lib/authz';

export default async function PlayersLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('player_editor');

  return (
    <AliasPickerProvider>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/control-panel" className="mb-6 inline-block text-sm text-blue-600 underline">
          ← Control panel
        </Link>
        <div className="flex gap-8">
          <aside className="w-96 shrink-0">
            <PlayerListPanel />
          </aside>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </AliasPickerProvider>
  );
}
