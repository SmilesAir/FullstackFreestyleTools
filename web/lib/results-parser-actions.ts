'use server';

import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { requirePermission } from './authz';
import { promptById } from './claude-prompts';
import { recordClaudeUsage } from './claude-usage';
import { pool } from './db';
import { getMode } from './db-mode';
import { DIVISION_NAMES, poolId } from './event-creator';
import { insertPlayerByName, matchAll } from './player-match';
import { getSetting } from './settings-queries';
import { ResultsSchema, DATE, allNames, buildResult, type ClaudeResults } from './results-parser/build';
import { getDivisionResults } from './results-parser/queries';
import type { EventOption, LoadedDivision, ParseResultsResult, SaveRound } from './results-parser/types';
import { validateResults } from './results-parser/validate';

const guard = () => requirePermission('results_parser');

const LOCAL_MESSAGE = 'Switch the server to Postgres (Neon) before saving results: the Rankings Generator reads them from there.';

// ---- Events and saved results ----------------------------------------------------------

export async function loadDivision(eventId: string, divisionName: string): Promise<{ error: string | null; loaded?: LoadedDivision }> {
  await guard();
  if (!(DIVISION_NAMES as readonly string[]).includes(divisionName)) return { error: 'Unknown division' };
  return { error: null, loaded: await getDivisionResults(eventId, divisionName) };
}

export async function createResultsEvent(
  name: string,
  startDate: string,
  endDate: string
): Promise<{ error: string | null; event?: EventOption }> {
  await guard();
  if (getMode() === 'local') return { error: LOCAL_MESSAGE };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Event name is required' };
  if (!DATE.test(startDate) || !DATE.test(endDate)) return { error: 'Start and end dates are required' };
  if (endDate < startDate) return { error: 'End date is before the start date' };

  const same = await pool.query('SELECT 1 FROM events WHERE lower(event_name) = lower($1) AND start_date = $2', [trimmed, startDate]);
  if (same.rows.length > 0) return { error: 'That event already exists: pick it from the list.' };

  const result = await pool.query<EventOption>(
    `INSERT INTO events (id, event_name, start_date, end_date, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())
     RETURNING id, event_name, start_date::text, end_date::text`,
    [trimmed, startDate, endDate]
  );
  return { error: null, event: result.rows[0] };
}

// Replaces the division's results with these rounds, publishing it (creating the
// division if the event doesn't have it yet). The round-0 roster rows are kept.
export async function saveDivisionResults(
  eventId: string,
  divisionName: string,
  rounds: SaveRound[]
): Promise<{ error: string | null; divisionId?: string; teams?: number }> {
  await guard();
  if (getMode() === 'local') return { error: LOCAL_MESSAGE };
  if (!(DIVISION_NAMES as readonly string[]).includes(divisionName)) return { error: 'Unknown division' };
  const problems = validateResults(rounds);
  if (problems.length > 0) return { error: problems[0] };

  const event = await pool.query('SELECT 1 FROM events WHERE id = $1', [eventId]);
  if (event.rows.length === 0) return { error: 'Event not found' };

  const teamIds: string[] = [];
  const roundNumbers: number[] = [];
  const pools: string[] = [];
  const places: number[] = [];
  const orders: number[] = [];
  const memberTeams: string[] = [];
  const memberPlayers: string[] = [];
  for (const round of rounds) {
    for (const p of round.pools) {
      p.teams.forEach((team, i) => {
        const id = crypto.randomUUID();
        teamIds.push(id);
        roundNumbers.push(round.round);
        pools.push(poolId(p.letter));
        places.push(team.place as number);
        orders.push(i + 1);
        for (const playerId of team.players) {
          memberTeams.push(id);
          memberPlayers.push(playerId as string);
        }
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`results:${eventId}:${divisionName}`]);

    const existing = await client.query<{ id: string }>('SELECT id FROM divisions WHERE event_id = $1 AND division_name = $2', [
      eventId,
      divisionName,
    ]);
    let divisionId: string;
    if (existing.rows[0]) {
      divisionId = existing.rows[0].id;
      await client.query('UPDATE divisions SET is_hidden = false WHERE id = $1', [divisionId]);
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO divisions (id, event_id, division_name, raw_text, is_hidden, created_at)
         VALUES (gen_random_uuid(), $1, $2, '', false, now()) RETURNING id`,
        [eventId, divisionName]
      );
      divisionId = inserted.rows[0].id;
    }

    await client.query('DELETE FROM teams WHERE division_id = $1 AND round_number >= 1', [divisionId]);
    await client.query(
      `INSERT INTO teams (id, division_id, round_number, pool_id, place, play_order)
       SELECT v.id, $1, v.round_number, v.pool_id, v.place, v.play_order
       FROM unnest($2::uuid[], $3::int[], $4::text[], $5::int[], $6::int[]) AS v(id, round_number, pool_id, place, play_order)`,
      [divisionId, teamIds, roundNumbers, pools, places, orders]
    );
    await client.query(
      `INSERT INTO team_players (id, team_id, player_id)
       SELECT gen_random_uuid(), v.team_id, v.player_id
       FROM unnest($1::uuid[], $2::uuid[]) AS v(team_id, player_id)`,
      [memberTeams, memberPlayers]
    );
    await client.query('COMMIT');
    return { error: null, divisionId, teams: teamIds.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // A player picked in the editor was deleted meanwhile.
    if (err && typeof err === 'object' && 'code' in err && err.code === '23503') return { error: 'One of the players no longer exists: pick them again.' };
    return { error: err instanceof Error ? err.message : 'Failed to save the results' };
  } finally {
    client.release();
  }
}

export async function setResultsPublished(divisionId: string, published: boolean): Promise<{ error: string | null }> {
  await guard();
  await pool.query('UPDATE divisions SET is_hidden = $2 WHERE id = $1', [divisionId, !published]);
  return { error: null };
}

export async function createPlayerForResults(fullName: string): Promise<{ error: string | null; player?: { id: string; name: string } }> {
  await guard();
  return insertPlayerByName(fullName);
}

// ---- Claude ----------------------------------------------------------------------------

export async function parseResultsText(text: string): Promise<ParseResultsResult> {
  const access = await guard();
  const prompt = promptById('results');

  const trimmed = text.trim();
  if (!trimmed) return { error: 'Paste some results first' };
  if (trimmed.length > 30000) return { error: 'That is too much text to parse at once. Try splitting it up.' };

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) return { error: "The Anthropic API key isn't set yet. Ask an admin to add it in Settings." };

  const client = new Anthropic({ apiKey });
  let parsed: ClaudeResults | null;
  try {
    // Streamed: a request with this much room for output could run past the
    // SDK's 10-minute limit for a plain request, which it refuses to send.
    const response = await client.messages
      .stream({
        model: prompt.model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: trimmed }],
        output_config: { effort: prompt.effort, format: zodOutputFormat(ResultsSchema) },
      })
      .finalMessage();
    await recordClaudeUsage({ feature: prompt.id, model: prompt.model, usage: response.usage, stopReason: response.stop_reason, userId: access.userId });
    if (response.stop_reason === 'refusal') return { error: 'Claude declined to parse that text.' };
    if (response.stop_reason === 'max_tokens') return { error: 'Those results are too large to parse in one go. Try splitting them up.' };
    parsed = response.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'The saved Anthropic API key was rejected. Ask an admin to update it in Settings.' };
    if (err instanceof Anthropic.RateLimitError) return { error: 'Anthropic is rate limiting requests right now. Try again shortly.' };
    if (err instanceof Anthropic.APIError) return { error: `Anthropic API error (${err.status}). Try again shortly.` };
    console.error('Results parser: Claude request failed', err);
    return { error: 'Failed to parse the results.' };
  }
  if (!parsed) return { error: "Couldn't read Claude's response. Try again." };

  return buildResult(parsed, await matchAll(allNames(parsed)));
}
