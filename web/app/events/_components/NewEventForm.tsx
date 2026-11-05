'use client';

import { useActionState } from 'react';
import { createEvent, type ActionState } from '@/lib/event-creator-actions';
import { useT } from '@/lib/i18n/client';

export function NewEventForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEvent, { error: null });
  const t = useT();

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{t.events.newEvent}</div>
      <input
        name="event_name"
        placeholder={t.events.eventNamePlaceholder}
        required
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
          {t.events.start}
          <input name="start_date" type="date" required className="rounded border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
          {t.events.end}
          <input name="end_date" type="date" required className="rounded border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t.events.creating : t.events.createEvent}
      </button>
    </form>
  );
}
