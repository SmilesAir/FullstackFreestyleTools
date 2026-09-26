import 'server-only';
import { pool } from './db';

// Notes that a judge's screen just asked the server for news, so the Head Judge
// can see who is connected. At most one small write per judge per second (the
// fastest a screen polls). A failure is ignored: presence is only a hint.
const lastWritten = new Map<string, number>();

export async function recordJudgeSeen(eventId: string, playerId: string): Promise<void> {
  const key = `${eventId}:${playerId}`;
  const now = Date.now();
  if (now - (lastWritten.get(key) ?? 0) < 900) return;
  lastWritten.set(key, now);
  try {
    await pool.query(
      `INSERT INTO judge_presence (event_id, player_id, seen_at) VALUES ($1, $2, now())
       ON CONFLICT (event_id, player_id) DO UPDATE SET seen_at = now()`,
      [eventId, playerId]
    );
  } catch {
    // The event or player doesn't exist, or the database is busy: nothing to record.
  }
}
