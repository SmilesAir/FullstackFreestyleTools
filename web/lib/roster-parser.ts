'use server';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { requirePermission } from './authz';
import { pool } from './db';
import { getSetting } from './settings-queries';

export type Candidate = { id: string; name: string; country: string | null; membership: number | null; score: number };
export type ParsedSlot = {
  input: string;
  status: 'matched' | 'uncertain' | 'none';
  candidates: Candidate[];
  selectedId: string | null;
};
export type ParseResult =
  | { error: string }
  | { error: null; teams: ParsedSlot[][]; unparsed: string[]; counts: { matched: number; uncertain: number; none: number } };

const RosterSchema = z.object({
  teams: z.array(z.object({ players: z.array(z.string()) })),
  unparsed: z.array(z.string()),
});

const SYSTEM_PROMPT = `You extract freestyle-frisbee tournament rosters from text that people paste in many formats.

Return every team in the text, each as the list of its players' names, in the order given. Formats vary: one team per line with names separated by "/", "&", "and", "+", "_", "-", commas or tabs; numbered or bulleted lists; "Team 1: A, B" headers; tables copied from spreadsheets or web pages; "Last, First" ordering. Judge from the whole text which separator means "another player on the same team" versus "another team".

Rules:
- Copy each name exactly as written (fix only obvious whitespace/casing noise). Never invent, complete, translate, or correct names.
- Do not return headings, seeds, rankings, countries, points, or other non-name text as players.
- If a line looks like a team or name but you cannot tell how to split it, put that line verbatim in "unparsed" instead of guessing. Put lines that are clearly not roster data (titles, notes) in "unparsed" as well.
- A team may have one or more players; do not pad or drop players.`;

export async function parseRosterText(text: string): Promise<ParseResult> {
  await requirePermission('event_creator');

  const trimmed = text.trim();
  if (!trimmed) return { error: 'Paste some text first' };
  if (trimmed.length > 30000) return { error: 'That is too much text to parse at once — try splitting it up.' };

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) return { error: "The Anthropic API key isn't set yet. Ask an admin to add it in Settings." };

  const client = new Anthropic({ apiKey });
  let parsed: z.infer<typeof RosterSchema> | null;
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
      output_config: { effort: 'low', format: zodOutputFormat(RosterSchema) },
    });
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

const MATCH_THRESHOLD = 0.6;
const CANDIDATE_FLOOR = 0.3;
const AMBIGUITY_GAP = 0.08;

// Fuzzy-match one written name against real (non-hidden) players, trying both
// "First Last" and "Last First" orderings. Aliases resolve to their primary.
async function matchName(input: string): Promise<ParsedSlot> {
  const result = await pool.query<{
    id: string;
    first_name: string;
    last_name: string;
    country: string | null;
    membership: number | null;
    score: number;
  }>(
    `SELECT COALESCE(a.id, p.id) AS id,
            COALESCE(a.first_name, p.first_name) AS first_name,
            COALESCE(a.last_name, p.last_name) AS last_name,
            COALESCE(a.country, p.country) AS country,
            COALESCE(a.membership, p.membership) AS membership,
            GREATEST(
              similarity(p.first_name || ' ' || p.last_name, $1),
              similarity(p.last_name || ' ' || p.first_name, $1)
            ) AS score
     FROM players p
     LEFT JOIN players a ON a.id = p.alias_id
     WHERE p.hidden = false
       AND GREATEST(
             similarity(p.first_name || ' ' || p.last_name, $1),
             similarity(p.last_name || ' ' || p.first_name, $1)
           ) >= $2
     ORDER BY score DESC
     LIMIT 8`,
    [input, CANDIDATE_FLOOR]
  );

  // An alias and its primary can both show up — keep the best score per player.
  const seen = new Map<string, Candidate>();
  for (const r of result.rows) {
    if (!seen.has(r.id)) {
      seen.set(r.id, {
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        country: r.country,
        membership: r.membership,
        score: Number(r.score),
      });
    }
  }
  const candidates = [...seen.values()].slice(0, 5);
  if (candidates.length === 0) return { input, status: 'none', candidates: [], selectedId: null };

  const [top, second] = candidates;
  const confident = top.score >= MATCH_THRESHOLD && (!second || top.score - second.score >= AMBIGUITY_GAP);
  return confident
    ? { input, status: 'matched', candidates, selectedId: top.id }
    : { input, status: 'uncertain', candidates, selectedId: null };
}
