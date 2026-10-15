import 'server-only';
import { pool } from './db';
import { getEventPoolNav, type DivisionNavEntry } from './public-results';

// An event is active while today falls within its dates. CURRENT_DATE is the
// database's (UTC) date and events run in every time zone, so a day of slack
// either side keeps an event from dropping off while it's still running
// locally. Test and hidden events are left out. `today` is only overridden by
// scripts checking the condition against another date.
export const activeEventSql = (alias: string, today = 'CURRENT_DATE') =>
  `(${today} BETWEEN ${alias}.start_date - 1 AND ${alias}.end_date + 1 AND NOT ${alias}.is_test AND NOT ${alias}.is_hidden)`;

export type ActiveEvent = {
  eventId: string;
  eventName: string;
  // 'YYYY-MM-DD'
  startDate: string;
  endDate: string;
  divisions: DivisionNavEntry[];
};

// Every active event with its divisions, rounds and pool letters (names and
// letters only), newest first.
export async function getActiveEvents(): Promise<ActiveEvent[]> {
  const events = await pool.query<{ id: string; event_name: string; start_date: string; end_date: string }>(
    `SELECT e.id, e.event_name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date, to_char(e.end_date, 'YYYY-MM-DD') AS end_date
     FROM events e
     WHERE ${activeEventSql('e')}
     ORDER BY e.start_date DESC, e.event_name`
  );
  return Promise.all(
    events.rows.map(async (e) => ({
      eventId: e.id,
      eventName: e.event_name,
      startDate: e.start_date,
      endDate: e.end_date,
      divisions: (await getEventPoolNav(e.id))?.divisions ?? [],
    }))
  );
}
