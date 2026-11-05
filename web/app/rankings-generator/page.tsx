import { getMode } from '@/lib/db-mode';
import { listGeneratorEvents } from '@/lib/points/load';
import { getSavedParams } from '@/lib/points-params-store';
import { listVersions } from '@/lib/points-snapshots';
import { GeneratorClient } from './_components/GeneratorClient';
import { getT } from '@/lib/i18n/server';

// Working out every rating reads the whole results history, which can take a few seconds.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export default async function RankingsGeneratorPage() {
  const t = await getT();
  // The local server holds only the event being run, not the results history the rankings
  // are made from, and published data has to go to Neon: nothing to do here until it is back.
  if (getMode() === 'local') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">{t.tools.rankings_generator.label}</h1>
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.rankings.localMode}
        </p>
      </main>
    );
  }

  const [events, params, versions] = await Promise.all([listGeneratorEvents(), getSavedParams(), listVersions()]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.tools.rankings_generator.label}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {t.rankings.intro}
        </p>
      </div>
      <GeneratorClient events={events} savedParams={params} versions={versions} today={new Date().toISOString().slice(0, 10)} local={false} />
    </main>
  );
}
