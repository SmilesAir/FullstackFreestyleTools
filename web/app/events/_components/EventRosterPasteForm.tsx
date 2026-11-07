'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseEventRosterText } from '@/lib/roster-parser';
import { toSlots } from '@/lib/roster-review';
import { RostersReview, type FoundDivision } from './RostersReview';
import { useT } from '@/lib/i18n/client';

// Paste the rosters of several divisions at once (a spreadsheet with one block per
// division works); Claude sorts them into the event's divisions, and any division the
// event doesn't have yet is created (and published straight away) when the teams are added.
export function EventRosterPasteForm({ eventId, existing }: { eventId: string; existing: string[] }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState('');
  const [found, setFound] = useState<FoundDivision[] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();

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

  function added(message: string) {
    setNotice(message);
    setFound(null);
    setUnparsed([]);
    setText('');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        {t.events.pasteHelp}
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
        {parsing ? t.events.parsing : t.events.parse}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {found && (
        <RostersReview
          eventId={eventId}
          existing={existing}
          found={found}
          setFound={setFound}
          onAdded={added}
          onError={setError}
          emptyMessage={t.events.noneFound}
        >
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
        </RostersReview>
      )}
    </div>
  );
}
