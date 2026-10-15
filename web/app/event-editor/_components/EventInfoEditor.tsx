'use client';

import { useState, useTransition } from 'react';
import { updateEventInfo } from '@/lib/event-editor-actions';

export type EventInfoPatch = { event_name: string; start_date: string; end_date: string };

// The detail panel's heading: name + dates read-only, with an Edit button
// that swaps them for inputs. Saves all three together.
export function EventInfoEditor({
  eventId,
  name,
  startDate,
  endDate,
  summary,
  onChange,
}: {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
  summary: string;
  onChange: (patch: EventInfoPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setDraftName(name);
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setError(null);
    setEditing(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateEventInfo(eventId, draftName, draftStart, draftEnd);
      if (result.error) {
        setError(result.error);
        return;
      }
      onChange({ event_name: result.event_name ?? draftName.trim(), start_date: draftStart, end_date: draftEnd });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="text-sm text-gray-600">
            {startDate} → {endDate} · {summary}
          </p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="shrink-0 rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">Event name</span>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          required
          autoFocus
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-gray-600">Start</span>
          <input
            type="date"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            required
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-gray-600">End</span>
          <input
            type="date"
            value={draftEnd}
            min={draftStart || undefined}
            onChange={(e) => setDraftEnd(e.target.value)}
            required
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
