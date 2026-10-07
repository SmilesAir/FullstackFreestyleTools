import 'server-only';
import { pool } from './db';
import { listEvents, type EventListItem } from './event-creator-queries';
import { getHeadJudgePools } from './head-judge-queries';
import type { HeadJudgeDivision } from './head-judge';

// What the calendar + list need for every event - EventListItem already has
// id/name/dates/counts/is_playing/bridge_enabled/is_test/is_hidden.
export type CalendarEvent = EventListItem;

// The Event Editor's "every event" list reuses the house listEvents() query
// (also used by Event Creator/Head Judge/Data Bridge), just with its cap
// lifted - there are ~900 events total, and a calendar that silently omits
// most of them defeats the point of the tool.
export async function listCalendarEvents(): Promise<CalendarEvent[]> {
  return listEvents(10000);
}

export type EventEditorDetail = {
  id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  is_playing: boolean;
  is_test: boolean;
  is_hidden: boolean;
  player_count: number;
  // divisions -> rounds -> pools -> teams (each team's recorded place included).
  divisions: HeadJudgeDivision[];
};

// Everything the detail panel shows for one event, in one call.
export async function getEventEditorDetail(eventId: string): Promise<EventEditorDetail | null> {
  const row = await pool.query<{
    id: string;
    event_name: string;
    start_date: string;
    end_date: string;
    is_playing: boolean;
    is_test: boolean;
    is_hidden: boolean;
    player_count: string;
  }>(
    `SELECT e.id, e.event_name, e.start_date::text, e.end_date::text, e.is_playing, e.is_test, e.is_hidden,
            (SELECT count(DISTINCT COALESCE(p.alias_id, p.id))
             FROM divisions d
             JOIN teams t ON t.division_id = d.id
             JOIN team_players tp ON tp.team_id = t.id
             JOIN players p ON p.id = tp.player_id
             WHERE d.event_id = e.id) AS player_count
     FROM events e
     WHERE e.id = $1`,
    [eventId]
  );
  const r = row.rows[0];
  if (!r) return null;

  const divisions = await getHeadJudgePools(eventId);
  return { ...r, player_count: Number(r.player_count), divisions };
}
