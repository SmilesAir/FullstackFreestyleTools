import type { CalendarEvent } from '@/lib/event-editor-queries';

export function EventListRow({
  event,
  selected,
  pulsing,
  onClick,
}: {
  event: CalendarEvent;
  selected: boolean;
  pulsing: boolean;
  onClick: () => void;
}) {
  const muted = event.is_test || event.is_hidden;

  return (
    <button
      type="button"
      id={`ee-list-row-${event.id}`}
      data-row-id={event.id}
      onClick={onClick}
      className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 ${
        selected ? 'bg-blue-50' : 'hover:bg-gray-50'
      } ${pulsing ? 'pulse-once' : ''}`}
    >
      <div className={`font-medium ${muted ? 'text-gray-400' : 'text-gray-900'}`}>
        {event.event_name}
        {event.is_test && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Test</span>}
        {event.is_hidden && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">Hidden</span>}
      </div>
      <div className="text-xs text-gray-500">
        {event.start_date} → {event.end_date} · {event.player_count} players
      </div>
    </button>
  );
}
