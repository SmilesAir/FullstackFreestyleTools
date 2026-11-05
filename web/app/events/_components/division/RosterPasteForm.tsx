'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseRosterText } from '@/lib/roster-parser';
import { addRosterTeams } from '@/lib/event-creator-actions';
import { applyResolution, completeTeams, slotCounts, toSlots, type Slot } from '@/lib/roster-review';
import { TeamsReview } from './TeamsReview';
import { useT } from '@/lib/i18n/client';

export function RosterPasteForm({ divisionId }: { divisionId: string }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState('');
  const [teams, setTeams] = useState<Slot[][] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();

  function parse() {
    setError(null);
    setNotice(null);
    startParse(async () => {
      const result = await parseRosterText(text);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setUnparsed(result.unparsed);
      setTeams(toSlots(result.teams));
    });
  }

  const counts = slotCounts(teams ?? []);

  function confirm() {
    if (!teams) return;
    const { ids, skipped } = completeTeams(teams);
    startSave(async () => {
      const result = await addRosterTeams(divisionId, ids);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(t.events.addedRoster(result.added ?? 0, skipped));
      setTeams(null);
      setUnparsed([]);
      setText('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'Paste teams in any format, e.g.\n1. Jane Doe / John Smith\nRiccardo Montanari & Francesco Santolin\nFabian Dinklage, Daniel O\'Neill'}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={parse}
        disabled={parsing || !text.trim()}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {parsing ? t.events.parsing : t.events.parse}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {teams && (
        <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
          <p className="text-sm">
            <strong>{teams.length}</strong> {t.events.teamsFoundRoster} <span className="text-green-700">{t.events.matched(counts.matched)}</span>
            {counts.created > 0 && <span className="text-green-700">{t.events.created(counts.created)}</span>},{' '}
            <span className={counts.review ? 'font-medium text-amber-700' : ''}>{counts.review} need review</span>,{' '}
            <span className={counts.unresolved ? 'font-medium text-red-700' : ''}>{counts.unresolved} new player(s)</span>
          </p>

          {unparsed.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
              <div className="font-medium text-amber-800">{t.events.couldntParse}</div>
              <ul className="list-disc pl-5 text-amber-900">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <TeamsReview teams={teams} update={(change) => setTeams((prev) => prev && change(prev))}
            resolve={(input, patch) => setTeams((prev) => prev && applyResolution(prev, input, patch))} onError={setError} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={saving || teams.length === 0}
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t.events.adding : t.events.addTeams}
            </button>
            <button type="button" onClick={() => setTeams(null)} className="rounded border border-gray-300 px-3 py-2 text-sm">
              {t.events.discard}
            </button>
          </div>
          <p className="text-xs text-gray-500">{t.events.skippedNoteRoster}</p>
        </div>
      )}
    </div>
  );
}
