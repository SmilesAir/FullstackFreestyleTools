import { getMode } from '@/lib/db-mode';
import { listEventOptions } from '@/lib/results-parser/queries';
import { getSetting } from '@/lib/settings-queries';
import { ResultsParserClient } from './_components/ResultsParserClient';

export const dynamic = 'force-dynamic';

export default async function ResultsParserPage() {
  // Saved results have to land in Neon, where the Rankings Generator and the public pages read them.
  if (getMode() === 'local') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-semibold">Results Parser</h1>
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The server is using the local database, which only holds the event being run. Switch to Postgres (Neon) with the database
          button on the Head Judge page, then reload this page.
        </p>
      </main>
    );
  }

  const [events, apiKey] = await Promise.all([listEventOptions(), getSetting('anthropic_api_key')]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Results Parser</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter the results of an event that ran outside this system. Paste them for Claude to fill in, or type them in, check the
          rounds, places and players, then save. Saved results count in the Rankings Generator.
        </p>
      </div>
      <ResultsParserClient events={events} hasKey={!!apiKey} />
    </main>
  );
}
