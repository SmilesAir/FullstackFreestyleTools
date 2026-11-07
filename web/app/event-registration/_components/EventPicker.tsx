'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatDayRange } from '@/lib/i18n/format';

export type PickerEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isTest: boolean;
  upcoming: boolean;
  hasForm: boolean;
  isOpen: boolean;
  registered: number;
};

// Choose the event whose registration form to build: upcoming events first, then past ones.
export function EventPicker({ events, selectedId }: { events: PickerEvent[]; selectedId: string | null }) {
  const t = useT();
  const tr = t.eventRegistration;
  const locale = useLocale();
  const router = useRouter();

  const option = (e: PickerEvent) => {
    const status = e.hasForm ? ` · ${e.isOpen ? tr.openTag : tr.closedTag} · ${tr.registeredCount(e.registered)}` : '';
    return (
      <option key={e.id} value={e.id}>
        {e.name}
        {e.isTest ? ` ${t.eventMusic.testTag}` : ''} ({formatDayRange(locale, e.startDate, e.endDate)}){status}
      </option>
    );
  };
  const upcoming = events.filter((e) => e.upcoming);
  const past = events.filter((e) => !e.upcoming);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{tr.eventPickerLabel}</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => router.push(e.target.value ? `/event-registration?event=${e.target.value}` : '/event-registration')}
        className="w-full max-w-xl rounded border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">{tr.chooseEventOption}</option>
        {upcoming.length > 0 && <optgroup label={tr.upcomingEvents}>{upcoming.map(option)}</optgroup>}
        {past.length > 0 && <optgroup label={tr.pastEvents}>{past.map(option)}</optgroup>}
      </select>
    </label>
  );
}
