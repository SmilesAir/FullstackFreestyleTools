import { requirePermission } from '@/lib/authz';
import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/data-bridge') };
}

export default async function DataBridgeLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('data_bridge');
  const t = await getT();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <ControlPanelLink label={t.common.backToControlPanel} className="mb-6" linkClassName="text-sm text-blue-600 underline" />
      {children}
    </div>
  );
}
