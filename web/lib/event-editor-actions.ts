'use server';

import { requirePermission } from './authz';
import { pool } from './db';
import { getEventEditorDetail, type EventEditorDetail } from './event-editor-queries';

export type ActionState = { error: string | null };

const guard = () => requirePermission('event_editor');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setEventTest(eventId: string, value: boolean): Promise<ActionState> {
  await guard();
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const result = await pool.query('UPDATE events SET is_test = $2 WHERE id = $1', [eventId, value]);
  return result.rowCount === 0 ? { error: 'Unknown event' } : { error: null };
}

export async function setEventHidden(eventId: string, value: boolean): Promise<ActionState> {
  await guard();
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const result = await pool.query('UPDATE events SET is_hidden = $2 WHERE id = $1', [eventId, value]);
  return result.rowCount === 0 ? { error: 'Unknown event' } : { error: null };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Name + dates together, validated the same way as Event Creator's createEvent.
export async function updateEventInfo(
  eventId: string,
  name: string,
  startDate: string,
  endDate: string
): Promise<ActionState & { event_name?: string }> {
  await guard();
  if (!UUID.test(eventId)) return { error: 'Unknown event' };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Event name is required' };
  if (!DATE.test(startDate) || !DATE.test(endDate)) return { error: 'Start and end dates are required' };
  if (endDate < startDate) return { error: 'End date is before the start date' };
  try {
    const result = await pool.query('UPDATE events SET event_name = $2, start_date = $3, end_date = $4 WHERE id = $1', [
      eventId,
      trimmed,
      startDate,
      endDate,
    ]);
    return result.rowCount === 0 ? { error: 'Unknown event' } : { error: null, event_name: trimmed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update event' };
  }
}

// A guarded read, for client-driven selection changes (clicking a list row or a
// calendar pill) that shouldn't trigger a full page navigation - the initial
// page load fetches the same data server-side in page.tsx instead.
export async function getEventDetail(eventId: string): Promise<EventEditorDetail | null> {
  await guard();
  if (!UUID.test(eventId)) return null;
  return getEventEditorDetail(eventId);
}
