'use client';

import { useTransition, type ReactNode } from 'react';
import { addEventRosters } from '@/lib/event-creator-actions';
import { applyResolution, completeTeams, slotCounts, type Slot } from '@/lib/roster-review';
import { TeamsReview } from './division/TeamsReview';
import { useT } from '@/lib/i18n/client';

export type FoundDivision = { divisionName: string; teams: Slot[][] };

// Teams for several divisions, under review before they're added to the event (any
// division it doesn't have yet is created). The parent owns the list; `onAdded` gets
// the notice to show once they're saved.
export function RostersReview({
  eventId,
  existing,
  found,
  setFound,
  onAdded,
  onError,
  emptyMessage,
  children,
}: {
  eventId: string;
  existing: string[];
  found: FoundDivision[];
  setFound: (change: (prev: FoundDivision[] | null) => FoundDivision[] | null) => void;
  onAdded: (notice: string) => void;
  onError: (message: string | null) => void;
  emptyMessage: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [saving, startSave] = useTransition();

  const updateDivision = (index: number, change: (prev: Slot[][]) => Slot[][]) =>
    setFound((prev) => prev && prev.map((d, i) => (i === index ? { ...d, teams: change(d.teams) } : d)));

  // A name fixed in one place is fixed in every division it is still unresolved in.
  const resolveEverywhere = (input: string, patch: Partial<Slot>) =>
    setFound((prev) => prev && prev.map((d) => ({ ...d, teams: applyResolution(d.teams, input, patch) })));

  const removeDivision = (index: number) => setFound((prev) => prev && prev.filter((_, i) => i !== index));

  function confirm() {
    const payload = found.map((d) => ({ divisionName: d.divisionName, ...completeTeams(d.teams) }));
    const skipped = payload.reduce((n, d) => n + d.skipped, 0);
    startSave(async () => {
      const result = await addEventRosters(
        eventId,
        payload.map((d) => ({ divisionName: d.divisionName, teams: d.ids }))
      );
      if (result.error) {
        onError(result.error);
        return;
      }
      const lines = (result.results ?? []).map((r) => t.events.addedLine(r.divisionName, r.added, !!r.created, r.duplicates ?? 0));
      onAdded(t.events.addedNotice(lines.join('; '), skipped));
    });
  }

  const totalTeams = found.reduce((n, d) => n + d.teams.length, 0);

  return (
    <div className="flex flex-col gap-4 rounded border border-gray-300 p-3">
      {found.length === 0 && <p className="text-sm text-amber-800">{emptyMessage}</p>}

      {children}

      {found.map((division, di) => {
        const counts = slotCounts(division.teams);
        return (
          <section key={division.divisionName} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gray-200 pb-1">
              <h3 className="font-semibold">{division.divisionName}</h3>
              <span className="text-xs text-gray-500">{existing.includes(division.divisionName) ? t.events.existingDivision : t.events.newDivisionTag}</span>
              <span className="text-sm">
                <strong>{division.teams.length}</strong> {t.events.teamsFound} <span className="text-green-700">{t.events.matched(counts.matched)}</span>
                {counts.created > 0 && <span className="text-green-700">{t.events.created(counts.created)}</span>},{' '}
                <span className={counts.review ? 'font-medium text-amber-700' : ''}>{counts.review} need review</span>,{' '}
                <span className={counts.unresolved ? 'font-medium text-red-700' : ''}>{counts.unresolved} new player(s)</span>
              </span>
              <button type="button" onClick={() => removeDivision(di)} className="ml-auto text-xs text-red-600 underline">
                leave out
              </button>
            </div>
            <TeamsReview teams={division.teams} update={(change) => updateDivision(di, change)} resolve={resolveEverywhere} onError={onError} />
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
          {saving ? t.events.adding : t.events.addToDivisions(totalTeams, found.length)}
        </button>
        <button type="button" onClick={() => setFound(() => null)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          {t.events.discard}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t.events.skippedNote}</p>
    </div>
  );
}
