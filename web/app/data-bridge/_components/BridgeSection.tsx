'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getOpenBridgeConflicts, resolveBridgeConflict, runBridgeNow, type BridgeConflictRow } from '@/lib/bridge-actions';
import type { ReconcileSummary } from '@/lib/bridge/reconcile';

// The Dynamo bridge's admin surface: a manual run (dry or for real, for testing against the
// real live table before trusting the scheduled cron) and the open conflicts a person
// resolves by hand - see web/lib/bridge/reconcile.ts for why these are never auto-guessed.
export function BridgeSection({ initialConflicts }: { initialConflicts: BridgeConflictRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [conflicts, setConflicts] = useState(initialConflicts);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function run(dryRun: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await runBridgeNow(dryRun);
      setSummary(result);
      setConflicts(await getOpenBridgeConflicts());
      router.refresh();
    });
  }

  function resolve(id: string, resolution: 'dynamo' | 'postgres' | 'ignored') {
    setResolvingId(id);
    startTransition(async () => {
      const result = await resolveBridgeConflict(id, resolution);
      if (result.error) setError(result.error);
      else setConflicts((prev) => prev.filter((c) => c.id !== id));
      setResolvingId(null);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Run &amp; conflicts</h2>
      <p className="text-sm text-gray-500">
        Runs automatically once a day (see <code className="rounded bg-gray-100 px-1">vercel.json</code>) for every
        event with its Bridge toggle on below. Use Dry run to preview a run against the real table with nothing
        written.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? 'Running…' : 'Dry run'}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Running…' : 'Run now'}
        </button>
      </div>

      {summary && (
        <div className="rounded border border-gray-300 p-3 text-sm">
          <div className="font-medium">{summary.dryRun ? 'Dry run result (nothing written):' : 'Run result:'}</div>
          <ul className="mt-1 list-disc pl-5 text-gray-700">
            <li>{summary.eventsChecked} bridged event(s) checked</li>
            <li>{summary.applied.toPostgres} change(s) applied to Postgres</li>
            <li>{summary.applied.toDynamo} change(s) applied to Dynamo</li>
            <li>{summary.conflicts} new conflict(s) flagged</li>
          </ul>
          {summary.errors.length > 0 && (
            <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-red-800">
              {summary.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <h3 className="mb-1 text-sm font-medium text-gray-600">
          Open conflicts {conflicts.length > 0 && `(${conflicts.length})`}
        </h3>
        {conflicts.length === 0 ? (
          <p className="text-sm text-gray-500">None right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                <div className="font-medium text-amber-900">
                  {c.entity_type} · {c.entity_key} · {c.field}
                </div>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <pre className="overflow-x-auto rounded bg-white p-1 text-xs">{JSON.stringify(c.dynamo_value, null, 1)}</pre>
                  <pre className="overflow-x-auto rounded bg-white p-1 text-xs">{JSON.stringify(c.postgres_value, null, 1)}</pre>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={resolvingId === c.id}
                    onClick={() => resolve(c.id, 'dynamo')}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Accept Dynamo (left)
                  </button>
                  <button
                    type="button"
                    disabled={resolvingId === c.id}
                    onClick={() => resolve(c.id, 'postgres')}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Accept Postgres (right)
                  </button>
                  <button
                    type="button"
                    disabled={resolvingId === c.id}
                    onClick={() => resolve(c.id, 'ignored')}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    Ignore
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
