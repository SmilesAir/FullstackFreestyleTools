import { getMode } from '@/lib/db-mode';
import { listEventOptions } from '@/lib/results-parser/queries';
import { getSetting } from '@/lib/settings-queries';
import { ResultsParserClient } from './_components/ResultsParserClient';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function ResultsParserPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventParam } = await searchParams;
  const t = await getT();

  // Saved results have to land in Neon, where the Rankings Generator and the public pages read them.
  if (getMode() === 'local') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">{t.tools.results_parser.label}</h1>
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.resultsParser.localMode}
        </p>
      </main>
    );
  }

  const [events, apiKey] = await Promise.all([listEventOptions(), getSetting('anthropic_api_key')]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.tools.results_parser.label}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {t.resultsParser.intro}
        </p>
      </div>
      <ResultsParserClient events={events} hasKey={!!apiKey} initialEventId={eventParam ?? ''} />
    </main>
  );
}
