'use client';

import { useActionState } from 'react';
import { setBackupIntervalAction, type ActionState } from '@/lib/backup-actions';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : null);

// How often the automatic backup runs, and when it last ran and runs next.
export function BackupScheduleForm({
  intervalDays,
  min,
  max,
  lastAutomaticAt,
  nextDueAt,
}: {
  intervalDays: number;
  min: number;
  max: number;
  lastAutomaticAt: string | null;
  nextDueAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setBackupIntervalAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">Automatic backup</div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        Every
        <input
          name="days"
          type="number"
          min={min}
          max={max}
          step={1}
          defaultValue={intervalDays}
          required
          className="w-20 rounded border border-gray-300 px-2 py-1"
        />
        days
        <button type="submit" disabled={pending} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </label>
      <p className="text-xs text-gray-500">
        {lastAutomaticAt ? `Last automatic backup: ${when(lastAutomaticAt)}. ` : 'No automatic backup yet. '}
        Next: {nextDueAt ? `the first daily check (03:00 UTC) after ${when(nextDueAt)}` : 'the next daily check (03:00 UTC)'}.
        Checked once a day by the hosted site; nothing runs on a laptop or in dev.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
