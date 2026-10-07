import { monthGrid, monthLabel, type MonthKey } from '@/lib/event-editor-dates';
import type { CalendarEvent } from '@/lib/event-editor-queries';
import { DayCell } from './DayCell';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthGrid({
  monthKey,
  eventsByDate,
  pulsingId,
  onSelect,
}: {
  monthKey: MonthKey;
  eventsByDate: Map<string, CalendarEvent[]>;
  pulsingId: string | null;
  onSelect: (id: string) => void;
}) {
  const weeks = monthGrid(monthKey);

  return (
    <div id={`ee-month-${monthKey}`} className="border-b border-gray-200 pb-2">
      <h2 className="sticky top-0 z-10 bg-white px-2 py-2 text-sm font-semibold text-gray-700 shadow-sm">{monthLabel(monthKey)}</h2>
      <div className="grid grid-cols-7 gap-px bg-gray-200 text-xs">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="bg-gray-50 px-1 py-1 text-center font-medium text-gray-500">
            {w}
          </div>
        ))}
        {weeks.flatMap((week) =>
          week.map((date) => (
            <DayCell
              key={date}
              date={date}
              inMonth={date.slice(0, 7) === monthKey}
              events={eventsByDate.get(date) ?? []}
              pulsingId={pulsingId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
