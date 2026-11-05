import { requirePermission } from '@/lib/authz';
import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/results-parser') };
}

export default async function ResultsParserLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('results_parser');
  const t = await getT();

  return (
    <div className="relative px-4 py-10">
      <ControlPanelLink label={t.headJudge.backToControlPanel} className="absolute right-4 top-10 leading-7" linkClassName="text-sm text-blue-600 underline" />
      {children}
    </div>
  );
}
