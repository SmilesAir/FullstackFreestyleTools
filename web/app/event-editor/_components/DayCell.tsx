import type { CalendarEvent } from '@/lib/event-editor-queries';
import { EventPill } from './EventPill';

export function DayCell({
  date,
  inMonth,
  events,
  pulsingId,
  onSelect,
}: {
  date: string; // 'YYYY-MM-DD'
  inMonth: boolean;
  events: CalendarEvent[];
  pulsingId: string | null;
  onSelect: (id: string) => void;
}) {
  const day = Number(date.slice(8, 10));

  return (
    <div id={`ee-day-${date}`} className={`min-h-[72px] bg-white p-1 ${inMonth ? '' : 'bg-gray-50'}`}>
      <div className={`mb-1 text-right text-[11px] ${inMonth ? 'text-gray-500' : 'text-gray-300'}`}>{day}</div>
      <div className="flex flex-col gap-0.5">
        {events.map((e) => (
          <EventPill key={e.id} event={e} pulsing={pulsingId === e.id} onClick={() => onSelect(e.id)} />
        ))}
      </div>
    </div>
  );
}
