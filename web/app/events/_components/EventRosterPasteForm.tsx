'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseEventRosterText } from '@/lib/roster-parser';
import { addEventRosters } from '@/lib/event-creator-actions';
import { applyResolution, completeTeams, slotCounts, toSlots, type Slot } from '@/lib/roster-review';
import { TeamsReview } from './division/TeamsReview';

type Found = { divisionName: string; teams: Slot[][] };

// Paste the rosters of several divisions at once (a spreadsheet with one block per
// division works); Claude sorts them into the event's divisions, and any division the
// event doesn't have yet is created as a draft when the teams are added.
export function EventRosterPasteForm({ eventId, existing }: { eventId: string; existing: string[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();

  function parse() {
    setError(null);
    setNotice(null);
    startParse(async () => {
      const result = await parseEventRosterText(text);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setUnparsed(result.unparsed);
      setFound(result.divisions.map((d) => ({ divisionName: d.divisionName, teams: toSlots(d.teams) })));
    });
  }

  const updateDivision = (index: number, change: (prev: Slot[][]) => Slot[][]) =>
    setFound((prev) => prev && prev.map((d, i) => (i === index ? { ...d, teams: change(d.teams) } : d)));

  // A name fixed in one place is fixed in every division it is still unresolved in.
  const resolveEverywhere = (input: string, patch: Partial<Slot>) =>
    setFound((prev) => prev && prev.map((d) => ({ ...d, teams: applyResolution(d.teams, input, patch) })));

  const removeDivision = (index: number) => setFound((prev) => prev && prev.filter((_, i) => i !== index));

  function confirm() {
    if (!found) return;
    const payload = found.map((d) => ({ divisionName: d.divisionName, ...completeTeams(d.teams) }));
    const skipped = payload.reduce((n, d) => n + d.skipped, 0);
    startSave(async () => {
      const result = await addEventRosters(
        eventId,
        payload.map((d) => ({ divisionName: d.divisionName, teams: d.ids }))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      const lines = (result.results ?? []).map(
        (r) => `${r.divisionName}: ${r.added} added${r.created ? ' (new division)' : ''}${r.duplicates ? `, ${r.duplicates} already there` : ''}`
      );
      setNotice(`${lines.join('; ')}.${skipped ? ` Skipped ${skipped} team(s) with unresolved players.` : ''}`);
      setFound(null);
      setUnparsed([]);
      setText('');
      router.refresh();
    });
  }

  const totalTeams = found?.reduce((n, d) => n + d.teams.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Paste the teams for one or more divisions, for example a spreadsheet with a heading row per division (Mixed pairs, Women pairs, Open
        pairs, Open coop) followed by its teams. Claude sorts them into this event&apos;s divisions.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'#\tMixed pairs\n1\tJane Doe\tJohn Smith\n2\tAnn Lee\tBob Jones\n\n#\tOpen coop\n1\tA One\tB Two\tC Three'}
        className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
      />
      <button
        type="button"
        onClick={parse}
        disabled={parsing || !text.trim()}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {parsing ? 'Parsing with Claude…' : 'Parse with Claude'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {found && (
        <div className="flex flex-col gap-4 rounded border border-gray-300 p-3">
          {found.length === 0 && <p className="text-sm text-amber-800">Claude didn&apos;t find teams for any known division in that text.</p>}

          {unparsed.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
              <div className="font-medium text-amber-800">Couldn&apos;t parse these lines:</div>
              <ul className="list-disc pl-5 text-amber-900">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {found.map((division, di) => {
            const counts = slotCounts(division.teams);
            return (
              <section key={division.divisionName} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gray-200 pb-1">
                  <h3 className="font-semibold">{division.divisionName}</h3>
                  <span className="text-xs text-gray-500">{existing.includes(division.divisionName) ? 'existing division' : 'new division, created as a draft'}</span>
                  <span className="text-sm">
                    <strong>{division.teams.length}</strong> team(s) — <span className="text-green-700">{counts.matched} matched</span>
                    {counts.created > 0 && <span className="text-green-700">, {counts.created} created</span>},{' '}
                    <span className={counts.review ? 'font-medium text-amber-700' : ''}>{counts.review} need review</span>,{' '}
                    <span className={counts.unresolved ? 'font-medium text-red-700' : ''}>{counts.unresolved} new player(s)</span>
                  </span>
                  <button type="button" onClick={() => removeDivision(di)} className="ml-auto text-xs text-red-600 underline">
                    leave out
                  </button>
                </div>
                <TeamsReview teams={division.teams} update={(change) => updateDivision(di, change)} resolve={resolveEverywhere} onError={setError} />
              </section>
            );
          })}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={saving || totalTeams === 0}
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${totalTeams} team(s) to ${found.length} division(s)`}
            </button>
            <button type="button" onClick={() => setFound(null)} className="rounded border border-gray-300 px-3 py-2 text-sm">
              Discard
            </button>
          </div>
          <p className="text-xs text-gray-500">Teams with any unresolved player are skipped, and teams already in a division are not added twice.</p>
        </div>
      )}
    </div>
  );
}
