'use client';

import { useActionState } from 'react';
import { setBackupIntervalAction, type ActionState } from '@/lib/backup-actions';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatDateTime } from '@/lib/i18n/format';



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
  const t = useT();
  const locale = useLocale();
  const when = (iso: string) => formatDateTime(locale, iso);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{t.admin.automaticBackup}</div>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t.admin.every}
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
        {t.admin.days}
        <button type="submit" disabled={pending} className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50">
          {pending ? t.common.saving : t.common.save}
        </button>
      </label>
      <p className="text-xs text-gray-500">
        {lastAutomaticAt ? t.admin.lastAutomatic(when(lastAutomaticAt)) : t.admin.noAutomatic}
        {nextDueAt ? t.admin.nextAfter(when(nextDueAt)) : t.admin.nextDaily} {t.admin.checkedDaily}
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
