import { z } from 'zod';
import { DIVISION_NAMES, POOL_LETTERS } from '../event-creator';
import type { ParsedSlot } from '../player-match-types';
import { newKey, type EditorRound, type EditorTeam, type ParsedDivision, type ParseResultsResult, type Slot } from './types';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ROUND_NAMES = ['Finals', 'Semifinals', 'Quarterfinals', 'Preliminaries'] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// The structured-output format only describes enums to the model, it doesn't enforce them, and
// one stray "Semi Finals" would fail the whole answer. So names come back as text and are mapped here.
export function resolveDivision(name: string): (typeof DIVISION_NAMES)[number] | null {
  const n = norm(name);
  const exact = DIVISION_NAMES.find((d) => norm(d) === n);
  if (exact) return exact;
  if (/^open(pairs?)?$/.test(n)) return 'Open Pairs';
  if (/^(open)?coop(erative)?$/.test(n)) return 'Open Co-op';
  if (/^women(s)?(pairs?)?$/.test(n)) return 'Women Pairs';
  if (/^mixed(pairs?)?$/.test(n)) return 'Mixed Pairs';
  return null;
}

export function resolveRound(name: string): number | null {
  const n = norm(name);
  if (/^finals?$/.test(n)) return 1;
  if (/^semi(final)?s?$/.test(n)) return 2;
  if (/^quarter(final)?s?$/.test(n)) return 3;
  if (/^(prelim(inar(y|ies))?s?|poolplay)$/.test(n)) return 4;
  return null;
}

// What Claude is asked to return.
export const ResultsSchema = z.object({
  eventName: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  divisions: z.array(
    z.object({
      divisionName: z.string(),
      rounds: z.array(
        z.object({
          round: z.string(),
          pools: z.array(
            z.object({
              pool: z.string().nullable(),
              teams: z.array(z.object({ place: z.number().nullable(), players: z.array(z.string()) })),
            })
          ),
        })
      ),
    })
  ),
  unparsed: z.array(z.string()),
});
export type ClaudeResults = z.infer<typeof ResultsSchema>;

export const allNames = (parsed: ClaudeResults): string[] =>
  parsed.divisions.flatMap((d) =>
    d.rounds.flatMap((r) => r.pools.flatMap((p) => p.teams.flatMap((t) => t.players.map((n) => n.trim()).filter(Boolean))))
  );

// Turns Claude's answer into editor rounds; `matches` holds the player match for each written name.
export function buildResult(parsed: ClaudeResults, matches: Map<string, ParsedSlot>): ParseResultsResult {
  const unparsed = parsed.unparsed.map((l) => l.trim()).filter(Boolean);

  const divisions: ParsedDivision[] = [];
  for (const division of parsed.divisions) {
    const divisionName = resolveDivision(division.divisionName);
    if (!divisionName) {
      unparsed.push(`Skipped the division "${division.divisionName}": it isn't one of ${DIVISION_NAMES.join(', ')}.`);
      continue;
    }
    // A round or pool named twice in the answer is merged.
    const rounds = new Map<number, Map<string, EditorTeam[]>>();
    for (const round of division.rounds) {
      const number = resolveRound(round.round);
      if (number === null) {
        unparsed.push(`Skipped the round "${round.round}" of ${divisionName}: it isn't one of ${ROUND_NAMES.join(', ')}.`);
        continue;
      }
      const pools = rounds.get(number) ?? new Map<string, EditorTeam[]>();
      rounds.set(number, pools);
      for (const pool of round.pools) {
        const letter = pool.pool?.match(/[A-D]/i)?.[0].toUpperCase() ?? POOL_LETTERS.find((l) => !pools.has(l)) ?? 'D';
        const teams = pools.get(letter) ?? [];
        pools.set(letter, teams);
        for (const team of pool.teams) {
          const players: Slot[] = team.players
            .map((n) => n.trim())
            .filter(Boolean)
            .map((name) => {
              const slot = matches.get(name);
              if (!slot) return { id: null, name: '', input: name, status: 'none', candidates: [] };
              const candidate = slot.candidates.find((c) => c.id === slot.selectedId);
              return { id: slot.selectedId, name: candidate?.name ?? '', input: name, status: slot.status, candidates: slot.candidates };
            });
          if (players.length === 0) continue;
          teams.push({ key: newKey(), place: team.place === null ? null : Math.round(team.place), players });
        }
      }
    }
    // A team with no place given finished where it is listed: its position in the pool
    // (after a tie that is the usual skip ahead: 1, 1, 3).
    const editor: EditorRound[] = [...rounds.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, pools]) => ({
        round,
        pools: [...pools.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([letter, teams]) => ({ letter, teams: teams.map((t, i) => (t.place === null ? { ...t, place: i + 1 } : t)) })),
      }));
    // A second answer for the same division is merged into the first.
    const earlier = divisions.find((d) => d.divisionName === divisionName);
    if (earlier) unparsed.push(`${divisionName} appeared twice in Claude's answer: only the first was kept.`);
    else divisions.push({ divisionName, rounds: editor });
  }

  return {
    error: null,
    eventName: parsed.eventName?.trim() || null,
    startDate: parsed.startDate && DATE.test(parsed.startDate) ? parsed.startDate : null,
    endDate: parsed.endDate && DATE.test(parsed.endDate) ? parsed.endDate : null,
    divisions,
    unparsed,
  };
}
