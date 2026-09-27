import 'server-only';
import { pool } from './db';
import { JUDGE_CATEGORY_LABELS, POOL_LETTERS, poolId } from './event-creator';
import { sortPoolTeams } from './event-creator-layout';
import { getPoolJudges, getTeams } from './event-creator-queries';
import { roundName, teamName } from './head-judge';
import { getEventDiscord, postToEventThread } from './discord';
import { playOrderImage, resultsImage, type ResultsRow } from './discord-images';
import { byPlace, poolStandings } from './pool-standings';
import { getOrCreateShortCode } from './pool-shortlink';
import { getPublicPoolResults } from './public-results';
import { getSetting } from './settings-queries';

// What the bot posts to an event's Discord thread: a round's play order (from the
// Event Creator) and a pool's results (when the Head Judge publishes them), each
// as a table image with the pools' public links. Only public data goes in: the
// results are the same anonymized ones the public results page shows.

const DEFAULT_SITE = 'https://freestylejudge.com';

// Category names short enough for the images: results column headings, and the
// label beside a judge's name in the play order.
const CATEGORY_LABELS: Record<string, string> = { Diff: 'Difficulty', AI: 'Artistic', Ex: 'Execution' };
const CATEGORY_ORDER = ['Diff', 'AI', 'Ex'];
const categoryOrder = (type: string) => (CATEGORY_ORDER.includes(type) ? CATEGORY_ORDER.indexOf(type) : CATEGORY_ORDER.length);

// 'skipped': the event has no Discord channel, so nothing was posted.
export type PostOutcome = { status: 'posted' } | { status: 'skipped' } | { status: 'failed'; error: string };

// The pool's permalink, in <> so Discord doesn't add a link preview under the image.
async function poolLink(divisionId: string, roundNumber: number, letter: string): Promise<string> {
  const site = ((await getSetting('public_site_url'))?.trim() || DEFAULT_SITE).replace(/\/+$/, '');
  return `<${site}/r/${await getOrCreateShortCode(divisionId, roundNumber, poolId(letter))}>`;
}

async function divisionOf(divisionId: string) {
  const result = await pool.query<{ event_id: string; division_name: string }>(
    'SELECT event_id, division_name FROM divisions WHERE id = $1',
    [divisionId]
  );
  return result.rows[0] ?? null;
}

// The linked Discord account of each of these players that has one (a team can
// hold a player's alias while the account links the main player: either counts).
async function discordIdsByPlayer(playerIds: string[]): Promise<Map<string, string>> {
  if (playerIds.length === 0) return new Map();
  const result = await pool.query<{ player_id: string; discord_id: string }>(
    `SELECT p.id AS player_id, u.discord_id
     FROM players p
     JOIN users u ON u.player_id = p.id OR u.player_id = p.alias_id
     WHERE p.id = ANY($1::uuid[]) AND u.discord_id ~ '^[0-9]{15,25}$'`,
    [playerIds]
  );
  return new Map(result.rows.map((r) => [r.player_id, r.discord_id]));
}

// Whether the event posts to Discord at all; an error if it can't be told.
async function channelSet(eventId: string): Promise<PostOutcome | null> {
  const discord = await getEventDiscord(eventId);
  if (!discord.ok) return { status: 'failed', error: discord.error };
  return discord.channelId ? null : { status: 'skipped' };
}

const safely = async (post: () => Promise<PostOutcome>): Promise<PostOutcome> => {
  try {
    return await post();
  } catch (err) {
    console.error('Discord post failed', err);
    return { status: 'failed', error: 'Could not post to Discord.' };
  }
};

// A pool's results: place, team, each category's total and the team's total.
export function postPoolResults(divisionId: string, roundNumber: number, letter: string): Promise<PostOutcome> {
  return safely(async () => {
    const division = await divisionOf(divisionId);
    if (!division) return { status: 'failed', error: 'Division not found' };
    const skip = await channelSet(division.event_id);
    if (skip) return skip;

    const result = await getPublicPoolResults(division.event_id, divisionId, roundNumber, letter);
    if (!result) return { status: 'failed', error: "That pool isn't public (is its division still a draft?)." };

    let columns: string[] = [];
    let rows: ResultsRow[];
    let totalLabel = 'Total';
    if (result.simpleRanking) {
      // Simple Ranking: the place is already worked out; the total is the sum of the ranks given (fewest wins).
      const names = new Map(result.simpleRanking.teams.map((t) => [t.id, t.name]));
      totalLabel = 'Rank sum';
      rows = [...result.simpleRanking.rows]
        .sort((a, b) => a.place - b.place)
        .map((r) => ({ place: r.place, team: names.get(r.teamId) ?? '', cells: [], total: r.total }));
    } else {
      const judgesByCategory = result.judgesByCategory ?? [];
      columns = judgesByCategory.map(({ category }) => CATEGORY_LABELS[category] ?? category);
      rows = [...poolStandings(result.teams, result.data ?? {}, judgesByCategory)]
        .sort(byPlace)
        .map((r) => ({ place: r.place, team: teamName(r.team), cells: r.categories.map((c) => c.total), total: r.total }));
    }

    const title = `${result.divisionName} · ${result.roundName} · Pool ${letter}`;
    const image = await resultsImage(title, `${result.eventName} · Results`, columns, rows, totalLabel);
    const link = await poolLink(divisionId, roundNumber, letter);
    // Results ping everyone watching the channel; the play order tags the people in each pool instead.
    const posted = await postToEventThread(
      division.event_id,
      `@here **${title}** results\n${link}`,
      { filename: `results-${roundNumber}-${letter}.png`, data: image },
      { here: true }
    );
    return posted.ok ? { status: 'posted' } : { status: 'failed', error: posted.error };
  });
}

// A round's play order: every pool's teams in the order they play, and its judges.
export function postRoundPlayOrder(divisionId: string, roundNumber: number): Promise<PostOutcome> {
  return safely(async () => {
    const division = await divisionOf(divisionId);
    if (!division) return { status: 'failed', error: 'Division not found' };
    const skip = await channelSet(division.event_id);
    if (skip) return { status: 'failed', error: 'This event has no Discord channel set: add one on the Events tab.' };

    const [allTeams, allJudges] = await Promise.all([getTeams(divisionId, division.division_name), getPoolJudges(divisionId)]);
    const teams = allTeams.filter((t) => t.round_number === roundNumber);
    const judges = allJudges.filter((j) => j.round_number === roundNumber);
    const pools = POOL_LETTERS.map((letter) => {
      const poolTeams = sortPoolTeams(teams.filter((t) => t.pool_id === poolId(letter)));
      const poolJudges = judges.filter((j) => j.pool_id === poolId(letter));
      return {
        letter,
        teams: poolTeams.map((t) => t.players.map((p) => p.name).join(' / ') || '(no players)'),
        // Difficulty, Artistic Impression, Execution (then any other category), each by name.
        judges: [...poolJudges]
          .sort((a, b) => categoryOrder(a.category_type) - categoryOrder(b.category_type) || a.name.localeCompare(b.name))
          .map((j) => ({ category: CATEGORY_LABELS[j.category_type] ?? JUDGE_CATEGORY_LABELS[j.category_type] ?? j.category_type, name: j.name })),
        // Everyone playing or judging in the pool, for tagging.
        people: [...poolTeams.flatMap((t) => t.players.map((p) => p.id)), ...poolJudges.map((j) => j.player_id)],
      };
    }).filter((p) => p.teams.length > 0);
    if (pools.length === 0) return { status: 'failed', error: 'This round has no teams yet.' };

    const eventName = (await getEventDiscord(division.event_id).then((d) => (d.ok ? d.eventName : ''))) || '';
    const title = `${division.division_name} · ${roundName(roundNumber)}`;
    const image = await playOrderImage(title, `${eventName} · Play order & judges`, pools);

    // Each pool's link, then a tag for everyone in it with a linked Discord account.
    const discordIds = await discordIdsByPlayer([...new Set(pools.flatMap((p) => p.people))]);
    const tagged = new Set<string>();
    const lines = await Promise.all(
      pools.map(async (p) => {
        const tags = [...new Set(p.people.map((id) => discordIds.get(id)).filter((id): id is string => !!id))];
        tags.forEach((id) => tagged.add(id));
        const link = `Pool ${p.letter}: ${await poolLink(divisionId, roundNumber, p.letter)}`;
        return tags.length > 0 ? `${link}\n${tags.map((id) => `<@${id}>`).join(' ')}` : link;
      })
    );
    const posted = await postToEventThread(
      division.event_id,
      `**${title}** play order & judges\n${lines.join('\n')}`,
      { filename: `play-order-${roundNumber}.png`, data: image },
      { users: [...tagged] }
    );
    return posted.ok ? { status: 'posted' } : { status: 'failed', error: posted.error };
  });
}
