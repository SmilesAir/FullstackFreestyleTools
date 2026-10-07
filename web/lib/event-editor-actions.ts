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

// A guarded read, for client-driven selection changes (clicking a list row or a
// calendar pill) that shouldn't trigger a full page navigation - the initial
// page load fetches the same data server-side in page.tsx instead.
export async function getEventDetail(eventId: string): Promise<EventEditorDetail | null> {
  await guard();
  if (!UUID.test(eventId)) return null;
  return getEventEditorDetail(eventId);
}
