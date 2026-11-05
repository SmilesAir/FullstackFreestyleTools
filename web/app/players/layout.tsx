import { PlayerListPanel } from './_components/PlayerListPanel';
import { AliasPickerProvider } from './_components/AliasPickerContext';
import { requirePermission } from '@/lib/authz';
import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/players') };
}

export default async function PlayersLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('player_editor');
  const t = await getT();

  return (
    <AliasPickerProvider>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <ControlPanelLink label={t.common.backToControlPanel} className="mb-6" linkClassName="text-sm text-blue-600 underline" />
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
