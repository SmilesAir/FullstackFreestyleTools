'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDivision } from '@/lib/event-creator-actions';
import { defaultRoutineSeconds } from '@/lib/event-creator';

export function NewDivisionForm({ eventId, available }: { eventId: string; available: string[] }) {
  const router = useRouter();
  const [name, setName] = useState(available[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await addDivision(eventId, name);
      if (result.error || !result.id) return setError(result.error ?? 'Failed to create division');
      router.push(`/events?event=${eventId}&division=${result.id}`);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
      <h2 className="font-semibold">New division</h2>
      <label className="flex flex-col gap-1 text-sm">
        Division type
        <select value={name} onChange={(e) => setName(e.target.value)} className="w-48 rounded border border-gray-300 px-2 py-1">
          {available.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-gray-500">
        Starts as a draft with a {defaultRoutineSeconds(name) / 60}-minute routine. Only types this event doesn&apos;t have yet are listed.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create division'}
      </button>
    </section>
  );
}
