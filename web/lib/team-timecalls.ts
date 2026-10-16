import 'server-only';
import { pool } from './db';
import { DEFAULT_TIMECALLS, cleanTimecalls } from './head-judge';
import { isPoolLocked, POOL_LOCKED_ERROR } from './pool-locks';
import { ALL_ROUNDS, type TeamMusicByRound } from './team-music-links';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyTeamCheck = { error: string } | { error: null; divisionId: string; playerIds: string[] };

// Whether the signed-in user may change this team's time calls or music: a
// team they are on (their linked player or one of its aliases), in an event
// that isn't over, through a row whose pool is still to come. With a round
// (music), that round's pool for the team must not be finished or locked
// either; a round not seeded yet is open. Returns the team's division and
// sorted player ids, which key its music.
export async function checkMyTeam(teamId: string, userId: string, round?: number): Promise<MyTeamCheck> {
  if (!UUID.test(teamId)) return { error: 'Unknown team' };
  const found = await pool.query<{
    mine: boolean;
    over: boolean;
    closed: boolean;
    round_closed: boolean;
    division_id: string;
    player_ids: string[] | null;
  }>(
    `WITH t AS (
       SELECT t.*, (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = t.id) AS player_ids
       FROM teams t WHERE t.id = $1
     )
     SELECT
       t.division_id, t.player_ids,
       EXISTS (SELECT 1 FROM team_players tp JOIN players p ON p.id = tp.player_id
               WHERE tp.team_id = t.id AND u.player_id IS NOT NULL
                 AND (p.id = u.player_id OR p.alias_id = u.player_id)) AS mine,
       NOT e.is_playing AND e.end_date + 1 < CURRENT_DATE AS over,
       EXISTS (SELECT 1 FROM teams o
               WHERE o.division_id = t.division_id AND o.round_number = t.round_number
                 AND o.pool_id = t.pool_id AND o.place IS NOT NULL)
       OR EXISTS (SELECT 1 FROM pools po
                  WHERE po.division_id = t.division_id AND po.round_number = t.round_number
                    AND po.pool_id = t.pool_id AND po.locked) AS closed,
       EXISTS (SELECT 1 FROM teams r
               WHERE r.division_id = t.division_id AND r.round_number = $3
                 AND (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = r.id) = t.player_ids
                 AND (EXISTS (SELECT 1 FROM teams o
                              WHERE o.division_id = r.division_id AND o.round_number = r.round_number
                                AND o.pool_id = r.pool_id AND o.place IS NOT NULL)
                      OR EXISTS (SELECT 1 FROM pools po
                                 WHERE po.division_id = r.division_id AND po.round_number = r.round_number
                                   AND po.pool_id = r.pool_id AND po.locked))) AS round_closed
     FROM t
     JOIN divisions d ON d.id = t.division_id
     JOIN events e ON e.id = d.event_id
     CROSS JOIN users u
     WHERE u.id = $2`,
    [teamId, userId, round ?? -1]
  );
  const row = found.rows[0];
  if (!row || !row.mine || !row.player_ids) return { error: 'You can only change your own team.' };
  if (row.over) return { error: 'This event is over.' };
  if (row.closed) return { error: "This team's pools are finished or locked." };
  if (round !== undefined && round !== ALL_ROUNDS && row.round_closed) {
    return { error: "This team's pool in that round is finished or locked." };
  }
  return { error: null, divisionId: row.division_id, playerIds: row.player_ids };
}

// A team's time calls belong to the team for the whole division, but a team has
// one `teams` row per round it is seeded into (and one on the roster). Saving
// writes the given row and every other row of the same players in the division
// whose pool is still to come (no results, not locked), so the Head Judge and
// the player see the same calls whichever row they read. Returns how many rows
// were written.
export async function saveTeamTimecalls(teamId: string, values: number[]): Promise<number> {
  const result = await pool.query(
    `WITH target AS (
       SELECT t.division_id,
              (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = t.id) AS players
       FROM teams t WHERE t.id = $1
     )
     UPDATE teams t SET timecalls = $2
     FROM target
     WHERE t.division_id = target.division_id
       AND (t.id = $1 OR (
         (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = t.id) = target.players
         AND NOT EXISTS (SELECT 1 FROM teams o
                         WHERE o.division_id = t.division_id AND o.round_number = t.round_number
                           AND o.pool_id = t.pool_id AND o.place IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM pools po
                         WHERE po.division_id = t.division_id AND po.round_number = t.round_number
                           AND po.pool_id = t.pool_id AND po.locked)
       ))`,
    [teamId, values]
  );
  return result.rowCount ?? 0;
}

// Sets the time calls a team asked for (seconds left when each is called out,
// 0 = "Time") from the Event Music screen, whose caller has
// already checked the permission. Refused while the team's pool is locked.
export async function setTeamTimecallsChecked(teamId: string, seconds: number[]): Promise<{ error: string | null }> {
  if (!UUID.test(teamId)) return { error: 'Unknown team' };
  const values = cleanTimecalls(seconds);
  if (!values) return { error: 'Bad time call' };
  const team = await pool.query<{ division_id: string; round_number: number; pool_id: string }>(
    'SELECT division_id, round_number, pool_id FROM teams WHERE id = $1',
    [teamId]
  );
  const row = team.rows[0];
  if (!row) return { error: 'Unknown team' };
  if (await isPoolLocked(row.division_id, row.round_number, row.pool_id)) return { error: POOL_LOCKED_ERROR };
  // Saved for the team's other pools still to come too.
  await saveTeamTimecalls(teamId, values);
  return { error: null };
}

// One of the player's teams: one per division they are entered in.
export type MyTeam = {
  // The row the time calls are read from and saved through.
  teamId: string;
  divisionId: string;
  eventName: string;
  // 'YYYY-MM-DD'
  startDate: string;
  divisionName: string;
  routineSeconds: number;
  players: string[];
  timecalls: number[];
  // False once every pool of the team's is finished or locked.
  editable: boolean;
  // The division's rounds, earliest first (Finals = 1 last).
  rounds: number[];
  // Rounds the team's music can still be set for: its pool there isn't
  // finished or locked, or it isn't seeded there yet.
  openRounds: number[];
  music: TeamMusicByRound;
};

// The player's teams (their own row or an alias's) in events that aren't over
// yet (a day of slack, as for active events) or being played, hidden events left out: one per
// division, soonest event first. Each division's row is its roster entry when
// there is one (it is never locked or finished), else its latest pool still to
// come, else its latest pool.
export async function getMyTeams(playerId: string): Promise<MyTeam[]> {
  const result = await pool.query<{
    team_id: string;
    division_id: string;
    event_name: string;
    start_date: string;
    division_name: string;
    routine_seconds: number;
    players: string[];
    timecalls: number[] | null;
    open: boolean;
    max_round: number | null;
    closed_rounds: number[];
    music: { round_number: number; file_url: string | null; file_name: string | null; link: string | null }[];
  }>(
    `WITH me AS (SELECT id FROM players WHERE id = $1 OR alias_id = $1),
     mine AS (
       SELECT t.id, t.division_id, t.round_number, t.timecalls,
              NOT EXISTS (SELECT 1 FROM teams o
                          WHERE o.division_id = t.division_id AND o.round_number = t.round_number
                            AND o.pool_id = t.pool_id AND o.place IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM pools po
                              WHERE po.division_id = t.division_id AND po.round_number = t.round_number
                                AND po.pool_id = t.pool_id AND po.locked) AS open
       FROM teams t
       JOIN divisions d ON d.id = t.division_id
       JOIN events e ON e.id = d.event_id
       WHERE (e.is_playing OR e.end_date + 1 >= CURRENT_DATE) AND NOT e.is_hidden
         AND EXISTS (SELECT 1 FROM team_players tp WHERE tp.team_id = t.id AND tp.player_id IN (SELECT id FROM me))
     ),
     chosen AS (
       SELECT DISTINCT ON (division_id) *
       FROM mine
       -- Roster first (round 0), then pools still to come, then the latest round (Finals = 1).
       ORDER BY division_id, (round_number = 0) DESC, open DESC, round_number
     )
     SELECT c.id AS team_id, c.division_id, e.event_name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
            d.division_name, d.routine_seconds, c.timecalls, c.open,
            COALESCE((SELECT array_agg(p.first_name || ' ' || p.last_name ORDER BY p.last_name, p.first_name)
                      FROM team_players tp JOIN players p ON p.id = tp.player_id
                      WHERE tp.team_id = c.id), '{}') AS players,
            -- Rounds count back from the Finals, so the earliest seeded or set-up round gives them all.
            GREATEST((SELECT max(round_number) FROM teams WHERE division_id = c.division_id),
                     (SELECT max(round_number) FROM pools WHERE division_id = c.division_id)) AS max_round,
            ARRAY(SELECT m.round_number FROM mine m
                  WHERE m.division_id = c.division_id AND m.round_number > 0 AND NOT m.open) AS closed_rounds,
            COALESCE((SELECT json_agg(json_build_object('round_number', tm.round_number, 'file_url', tm.file_url,
                                                        'file_name', tm.file_name, 'link', tm.link))
                      FROM team_music tm
                      WHERE tm.division_id = c.division_id
                        AND tm.player_ids = (SELECT array_agg(tp.player_id ORDER BY tp.player_id)
                                             FROM team_players tp WHERE tp.team_id = c.id)), '[]') AS music
     FROM chosen c
     JOIN divisions d ON d.id = c.division_id
     JOIN events e ON e.id = d.event_id
     ORDER BY e.start_date, e.event_name, d.division_name`,
    [playerId]
  );
  return result.rows.map((r) => ({
    teamId: r.team_id,
    divisionId: r.division_id,
    eventName: r.event_name,
    startDate: r.start_date,
    divisionName: r.division_name,
    routineSeconds: r.routine_seconds,
    players: r.players,
    timecalls: r.timecalls ?? DEFAULT_TIMECALLS,
    editable: r.open,
    ...musicRounds(r.max_round, r.closed_rounds),
    music: Object.fromEntries(
      r.music.map((m) => [m.round_number, { fileUrl: m.file_url, fileName: m.file_name, link: m.link }])
    ),
  }));
}

// The division's rounds (Quarterfinals, Semifinals, Finals when none are set up yet)
// and which of them the team's music can still be set for.
function musicRounds(maxRound: number | null, closedRounds: number[]): { rounds: number[]; openRounds: number[] } {
  const highest = maxRound && maxRound > 0 ? maxRound : 3;
  const rounds = Array.from({ length: highest }, (_, i) => highest - i);
  return { rounds, openRounds: rounds.filter((n) => !closedRounds.includes(n)) };
}
