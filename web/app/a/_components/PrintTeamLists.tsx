'use client';

import { poolTitle, teamName, type HeadJudgeDivision, type HeadJudgePool } from '@/lib/head-judge';
import { formatElapsed } from '@/lib/head-judge-state';

// Choosing which pools' team lists to print: every pool of the event, by
// division and round. Printing prints only PrintSheets (the rest of the page
// is hidden from print).
export function PrintPicker({
  divisions,
  chosen,
  onChange,
}: {
  divisions: HeadJudgeDivision[];
  chosen: string[];
  onChange: (keys: string[]) => void;
}) {
  const allKeys = divisions.flatMap((d) => d.rounds.flatMap((r) => r.pools.map((p) => p.key)));
  const toggle = (key: string) => onChange(chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key]);

  return (
    <section className="flex flex-col gap-3 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Pools to print</span>
        <button type="button" onClick={() => onChange(allKeys)} className="text-blue-600 underline">
          All
        </button>
        <button type="button" onClick={() => onChange([])} className="text-blue-600 underline">
          None
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={chosen.length === 0}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-100 disabled:opacity-50"
        >
          Print {chosen.length === 1 ? '1 pool' : `${chosen.length} pools`}
        </button>
      </div>

      {divisions.length === 0 && <p className="text-gray-500">This event has no pools yet.</p>}
      {divisions.map((division) => (
        <div key={division.id}>
          <div className="font-medium">{division.name}</div>
          {division.rounds.map((round) => (
            <div key={round.number} className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-3">
              <span className="w-28 text-gray-600">{round.name}</span>
              {round.pools.map((pool) => (
                <label key={pool.key} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={chosen.includes(pool.key)} onChange={() => toggle(pool.key)} />
                  Pool {pool.letter}
                </label>
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

// Print layout, in inches. Laid out for the shorter of Letter and A4 (Letter:
// 11in less the margins), so a pool of up to TEAMS_PER_PAGE teams fills one page.
const PAGE_MARGIN = 0.5;
const PAGE_HEIGHT = 11 - 2 * PAGE_MARGIN - 0.2; // a little spare for the browser's rounding
const HEADER = 0.55 + 0.1; // the pool's header and the space under it
const NAME = 0.25 + 0.05; // a team's name line and the space under it
const GAP = 0.12; // between teams
const TEAMS_PER_PAGE = 8;
const MAX_BOX = 2.25;

// The height of each team's notes box: the page shared out among the pool's
// teams, never smaller than what 8 to a page leaves (a bigger pool runs on to
// a second page) nor bigger than MAX_BOX.
function notesBoxInches(teams: number): number {
  const fit = (n: number) => (PAGE_HEIGHT - HEADER - n * NAME - (n - 1) * GAP) / n;
  return Math.min(MAX_BOX, fit(Math.min(Math.max(teams, 1), TEAMS_PER_PAGE)));
}

// The printed team lists: each chosen pool on its own page, each team with an
// empty box for the announcer's handwritten notes, up to 8 teams to a page.
// Only shown when printing.
export function PrintSheets({ pools, eventName }: { pools: HeadJudgePool[]; eventName: string }) {
  return (
    <div className="hidden text-black print:block">
      <style>{`@page { margin: ${PAGE_MARGIN}in; }`}</style>
      {pools.map((pool, i) => {
        const box = notesBoxInches(pool.teams.length);
        return (
          <section key={pool.key} className={i > 0 ? 'break-before-page' : ''}>
            <div
              className="flex items-end justify-between gap-4 overflow-hidden border-b-2 border-black"
              style={{ height: '0.55in', marginBottom: '0.1in' }}
            >
              <h2 className="text-xl leading-tight font-bold">{poolTitle(pool)}</h2>
              <div className="pb-1 text-right text-xs">
                {eventName}
                <br />
                {pool.teams.length} teams · {formatElapsed(pool.routineSeconds * 1000)} routines
              </div>
            </div>
            <ol>
              {pool.teams.map((team, n) => (
                <li key={team.id} className="break-inside-avoid" style={{ marginTop: n > 0 ? `${GAP}in` : 0 }}>
                  <div className="truncate font-bold" style={{ fontSize: '12pt', lineHeight: '0.25in', marginBottom: '0.05in' }}>
                    {n + 1}. {teamName(team)}
                  </div>
                  <div className="rounded border border-gray-500" style={{ height: `${box}in` }} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
