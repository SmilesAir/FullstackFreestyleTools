import 'server-only';
import { pool } from './db';
import { getEventPoolNav, type DivisionNavEntry } from './public-results';

// An event is active while it is marked as playing (being judged; toggled in
// the Event Creator's Events tab), whatever its dates. Hidden events are left
// out (test events are kept).
export const activeEventSql = (alias: string) => `(${alias}.is_playing AND NOT ${alias}.is_hidden)`;

export type ActiveEvent = {
  eventId: string;
  eventName: string;
  // 'YYYY-MM-DD'
  startDate: string;
  endDate: string;
  isTest: boolean;
  divisions: DivisionNavEntry[];
};

// Every active event with its divisions, rounds and pool letters (names and
// letters only), newest first.
export async function getActiveEvents(): Promise<ActiveEvent[]> {
  const events = await pool.query<{ id: string; event_name: string; start_date: string; end_date: string; is_test: boolean }>(
    `SELECT e.id, e.event_name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date, to_char(e.end_date, 'YYYY-MM-DD') AS end_date, e.is_test
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
      isTest: e.is_test,
      divisions: (await getEventPoolNav(e.id))?.divisions ?? [],
    }))
  );
}
