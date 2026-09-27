import { DIVISION_NAMES } from './event-creator';
import { ROUND_NAMES } from './results-parser/build';

// Every prompt the app sends to Claude, in one place: the code that makes the calls and the
// Settings page that lists them both read from here, so what an admin sees is what is sent.
// (Not a 'use server' file: those may only export async functions.)

export const CLAUDE_MODEL = 'claude-opus-5';

export type ClaudePromptId = 'roster-division' | 'roster-event' | 'results';

export type ClaudePrompt = {
  id: ClaudePromptId;
  name: string;
  usedIn: string;
  model: string;
  effort: 'low';
  maxTokens: number;
  // What comes back, in words (the exact schema lives next to the code that calls Claude).
  outputSummary: string;
  system: string;
};

const ROSTER_DIVISION_SYSTEM = `You extract freestyle-frisbee tournament rosters from text that people paste in many formats.

Return every team in the text, each as the list of its players' names, in the order given. Formats vary: one team per line with names separated by "/", "&", "and", "+", "_", "-", commas or tabs; numbered or bulleted lists; "Team 1: A, B" headers; tables copied from spreadsheets or web pages; "Last, First" ordering. Judge from the whole text which separator means "another player on the same team" versus "another team".

Rules:
- Copy each name exactly as written (fix only obvious whitespace/casing noise). Never invent, complete, translate, or correct names.
- Do not return headings, seeds, rankings, countries, points, or other non-name text as players.
- If a line looks like a team or name but you cannot tell how to split it, put that line verbatim in "unparsed" instead of guessing. Put lines that are clearly not roster data (titles, notes) in "unparsed" as well.
- A team may have one or more players; do not pad or drop players.`;

const ROSTER_EVENT_SYSTEM = `You extract freestyle-frisbee tournament rosters for one or more divisions from text that people paste in many formats. Usually it is a spreadsheet copied with tabs: one block per division, each starting with a heading row that names the division (for example "#  Mixed pairs  Music in"), followed by one row per team.

Return each division with its name as written in the heading and its teams, each team as the list of its players' names, in the order given.

Rules:
- A row usually starts with an entry number, then the players' names (two for pairs, three for co-op), then marker columns such as "X", "Y" or a tick. The number and the markers are not players. A row that is only a number, and blank rows, are not teams.
- Formats vary: separators such as "/", "&", "and", "+", commas or tabs; numbered or bulleted lists; "Last, First" ordering. Judge from the whole text which separator means "another player on the same team" versus "another team".
- Copy each name exactly as written, keeping accents and punctuation (only trim whitespace). Never invent, complete, translate or correct names.
- If a line looks like a team but you cannot tell how to split it, put that line verbatim in "unparsed" instead of guessing. Put lines that are clearly not roster data (titles, notes) there too.
- A team may have one or more players; do not pad or drop players. A player who is in several divisions appears in each of them.`;

const RESULTS_SYSTEM = `You extract freestyle-frisbee tournament results from text that people paste in many formats: tables copied from spreadsheets or web pages, lists like "1. Jane Doe / John Smith", "1st Jane Doe & John Smith", results split into Finals, Semifinals, Quarterfinals and Preliminaries or Pool A / Pool B, and results for several divisions at once.

Return, for each division, its rounds; for each round its pools; for each pool its teams with the finishing place and the players' names.

Rules:
- Divisions must be one of: ${DIVISION_NAMES.join(', ')}. Map obvious variants (Open, Open Pairs, Women, Women's Pairs, Mixed, Coop / Co-op). If the text names no division at all, the results are Open Pairs. Results for any other named division go in "unparsed".
- Rounds must be one of: ${ROUND_NAMES.join(', ')}. Map Final, Semi, Quarter, Prelim, Pool play and similar. If the text gives a single list of results with no round named, it is the Finals.
- A place is the finishing place as a whole number. A number leading a result line is its place, however it is written: "1.", "1)", "1-", "1 -", "1:", "#1", "1st". Numbers in headings or event names (like "123 Four Seasons") are not places. Teams that tied share the number ("T-3", "3=" are both 3; the next place skips ahead, so 1, 2, 3, 3, 5). If teams are listed with no place given, number them 1, 2, 3 in the order listed; don't return null for a team in an ordered list.
- Places are numbered within their own pool. If a round has several pools, each pool's list starts again at 1. The pool is its letter ("A", "B", ...); with no pool named, use "A".
- Each team is the list of its players' names. Split them by "/", "&", "and", "+", commas or tabs, judging from the whole text which separator means "another player on the same team".
- Copy names exactly as written (fix only whitespace or casing noise). Never invent, complete, translate or correct names, places or rounds.
- Return the event name and its start and end dates (YYYY-MM-DD) only when the text states them; otherwise null.
- If a line looks like a result but you cannot tell how to place it, put that line verbatim in "unparsed". Put lines that are clearly not results (titles, judges, notes) there too.`;

export const CLAUDE_PROMPTS: readonly ClaudePrompt[] = [
  {
    id: 'roster-division',
    name: 'Roster, one division',
    usedIn: 'Event Creator: a division tab, Add teams, Parse with Claude',
    model: CLAUDE_MODEL,
    effort: 'low',
    maxTokens: 16000,
    outputSummary: "A list of teams, each a list of the players' names as written, plus any lines it could not place.",
    system: ROSTER_DIVISION_SYSTEM,
  },
  {
    id: 'roster-event',
    name: 'Roster, several divisions',
    usedIn: 'Event Creator: Events tab, the selected event, Add teams to several divisions with Claude',
    model: CLAUDE_MODEL,
    effort: 'low',
    maxTokens: 16000,
    outputSummary: "A list of divisions (by the heading in the text), each with its teams and their players' names, plus any lines it could not place.",
    system: ROSTER_EVENT_SYSTEM,
  },
  {
    id: 'results',
    name: 'Results',
    usedIn: 'Results Parser: Fill from Claude',
    model: CLAUDE_MODEL,
    effort: 'low',
    maxTokens: 16000,
    outputSummary:
      "The event name and dates if stated, then per division its rounds, pools and teams with the finishing place and the players' names, plus any lines it could not place.",
    system: RESULTS_SYSTEM,
  },
];

export function promptById(id: ClaudePromptId): ClaudePrompt {
  const prompt = CLAUDE_PROMPTS.find((p) => p.id === id);
  if (!prompt) throw new Error(`No prompt ${id}`);
  return prompt;
}
