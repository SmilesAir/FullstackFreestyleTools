import type { CalendarEvent } from '@/lib/event-editor-queries';
import { useT } from '@/lib/i18n/client';

export function EventPill({ event, pulsing, onClick }: { event: CalendarEvent; pulsing: boolean; onClick: () => void }) {
  const muted = event.is_test || event.is_hidden;
  const t = useT();
  const badge = event.is_test && event.is_hidden
    ? t.eventEditor.testHidden
    : event.is_test
      ? t.eventEditor.test
      : event.is_hidden
        ? t.eventEditor.hidden
        : null;

  return (
    <button
      type="button"
      onClick={onClick}
      title={event.event_name}
      className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${pulsing ? 'pulse-once' : ''} ${
        muted ? 'bg-gray-200 text-gray-500 opacity-50' : 'bg-blue-100 text-blue-900'
      }`}
    >
      {event.event_name}
      {badge && <span className="ml-1 rounded bg-gray-300 px-1 text-[9px] font-medium text-gray-700">{badge}</span>}
    </button>
  );
}
