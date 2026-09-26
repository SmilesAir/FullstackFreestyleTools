'use server';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { requirePermission } from './authz';
import { promptById } from './claude-prompts';
import { recordClaudeUsage } from './claude-usage';
import { DIVISION_NAMES } from './event-creator';
import { matchAll, matchName } from './player-match';
import type { ParsedSlot } from './player-match-types';
import { resolveDivision } from './results-parser/build';
import { getSetting } from './settings-queries';

export type { Candidate, ParsedSlot } from './player-match-types';
export type ParseResult =
  | { error: string }
  | { error: null; teams: ParsedSlot[][]; unparsed: string[]; counts: { matched: number; uncertain: number; none: number } };

const RosterSchema = z.object({
  teams: z.array(z.object({ players: z.array(z.string()) })),
  unparsed: z.array(z.string()),
});

export async function parseRosterText(text: string): Promise<ParseResult> {
  const access = await requirePermission('event_creator');
  const prompt = promptById('roster-division');

  const trimmed = text.trim();
  if (!trimmed) return { error: 'Paste some text first' };
  if (trimmed.length > 30000) return { error: 'That is too much text to parse at once — try splitting it up.' };

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) return { error: "The Anthropic API key isn't set yet. Ask an admin to add it in Settings." };

  const client = new Anthropic({ apiKey });
  let parsed: z.infer<typeof RosterSchema> | null;
  try {
    const response = await client.messages.parse({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: trimmed }],
      output_config: { effort: prompt.effort, format: zodOutputFormat(RosterSchema) },
    });
    // Billed whatever the outcome, so logged before the early returns below.
    await recordClaudeUsage({ feature: prompt.id, model: prompt.model, usage: response.usage, stopReason: response.stop_reason, userId: access.userId });
    if (response.stop_reason === 'refusal') return { error: 'Claude declined to parse that text.' };
    if (response.stop_reason === 'max_tokens') return { error: 'That list is too large to parse in one go — try splitting it up.' };
    parsed = response.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'The saved Anthropic API key was rejected. Ask an admin to update it in Settings.' };
    if (err instanceof Anthropic.RateLimitError) return { error: 'Anthropic is rate limiting requests right now. Try again shortly.' };
    if (err instanceof Anthropic.APIError) return { error: `Anthropic API error (${err.status}). Try again shortly.` };
    return { error: 'Failed to parse the teams.' };
  }
  if (!parsed) return { error: "Couldn't read Claude's response. Try again." };

  const teams: ParsedSlot[][] = [];
  const counts = { matched: 0, uncertain: 0, none: 0 };
  for (const team of parsed.teams) {
    const slots: ParsedSlot[] = [];
    for (const name of team.players.map((n) => n.trim()).filter(Boolean)) {
      const slot = await matchName(name);
      counts[slot.status]++;
      slots.push(slot);
    }
    if (slots.length > 0) teams.push(slots);
  }

  return { error: null, teams, unparsed: parsed.unparsed.map((l) => l.trim()).filter(Boolean), counts };
}

// ---- Several divisions at once (the Event Creator's event section) ---------------------

export type EventParseResult =
  | { error: string }
  | { error: null; divisions: { divisionName: string; teams: ParsedSlot[][] }[]; unparsed: string[] };

// The division is text, not an enum: the output format only describes enums to the model
// and one stray name would fail the whole answer. Names are mapped below.
const EventRosterSchema = z.object({
  divisions: z.array(z.object({ division: z.string(), teams: z.array(z.object({ players: z.array(z.string()) })) })),
  unparsed: z.array(z.string()),
});

export async function parseEventRosterText(text: string): Promise<EventParseResult> {
  const access = await requirePermission('event_creator');
  const prompt = promptById('roster-event');

  const trimmed = text.trim();
  if (!trimmed) return { error: 'Paste some text first' };
  if (trimmed.length > 30000) return { error: 'That is too much text to parse at once — try splitting it up.' };

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) return { error: "The Anthropic API key isn't set yet. Ask an admin to add it in Settings." };

  const client = new Anthropic({ apiKey });
  let parsed: z.infer<typeof EventRosterSchema> | null;
  try {
    const response = await client.messages.parse({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content: trimmed }],
      output_config: { effort: prompt.effort, format: zodOutputFormat(EventRosterSchema) },
    });
    await recordClaudeUsage({ feature: prompt.id, model: prompt.model, usage: response.usage, stopReason: response.stop_reason, userId: access.userId });
    if (response.stop_reason === 'refusal') return { error: 'Claude declined to parse that text.' };
    if (response.stop_reason === 'max_tokens') return { error: 'That list is too large to parse in one go — try splitting it up.' };
    parsed = response.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { error: 'The saved Anthropic API key was rejected. Ask an admin to update it in Settings.' };
    if (err instanceof Anthropic.RateLimitError) return { error: 'Anthropic is rate limiting requests right now. Try again shortly.' };
    if (err instanceof Anthropic.APIError) return { error: `Anthropic API error (${err.status}). Try again shortly.` };
    console.error('Roster parser: Claude request failed', err);
    return { error: 'Failed to parse the teams.' };
  }
  if (!parsed) return { error: "Couldn't read Claude's response. Try again." };

  const names = (players: string[]) => players.map((n) => n.trim()).filter(Boolean);
  const matches = await matchAll(parsed.divisions.flatMap((d) => d.teams.flatMap((t) => names(t.players))));

  const unparsed = parsed.unparsed.map((l) => l.trim()).filter(Boolean);
  const divisions: { divisionName: string; teams: ParsedSlot[][] }[] = [];
  for (const division of parsed.divisions) {
    const divisionName = resolveDivision(division.division);
    if (!divisionName) {
      unparsed.push(`Skipped "${division.division}": it isn't one of ${DIVISION_NAMES.join(', ')}.`);
      continue;
    }
    const teams = division.teams.map((t) => names(t.players).map((n) => matches.get(n) as ParsedSlot)).filter((t) => t.length > 0);
    // A division named twice in the text is one division.
    const earlier = divisions.find((d) => d.divisionName === divisionName);
    if (earlier) earlier.teams.push(...teams);
    else divisions.push({ divisionName, teams });
  }
  return { error: null, divisions, unparsed };
}
