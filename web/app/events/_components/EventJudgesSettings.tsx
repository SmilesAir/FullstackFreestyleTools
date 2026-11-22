'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEventJudges } from '@/lib/event-creator-actions';
import type { PlayerRef } from '@/lib/event-creator-queries';
import { parseJudgeNamesText } from '@/lib/roster-parser';
import { applyResolution, toSlots, type Slot } from '@/lib/roster-review';
import { PlayerPicker } from './PlayerPicker';
import { TeamsReview } from './division/TeamsReview';
import { useT } from '@/lib/i18n/client';

type Member = { id: string; name: string; country?: string | null };

// The event's judges list: extra people offered in Set Judges, besides the
// players on its teams. Names are pasted and sorted out by Claude, then matched
// to players for review; one person can also be picked directly. Each change
// is saved straight away.
export function EventJudgesSettings({
  eventId,
  members: initialMembers,
  error: loadError,
}: {
  eventId: string;
  members: PlayerRef[];
  error: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [text, setText] = useState('');
  // Each parsed name as a one-person "team", so TeamsReview can show it.
  const [found, setFound] = useState<Slot[][] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  const [parsing, startParse] = useTransition();

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  function save(next: Member[], onSaved?: () => void) {
    const previous = members;
    setMembers(next);
    startSave(async () => {
      const result = await setEventJudges(eventId, next.map((m) => m.id));
      setError(result.error);
      if (result.error) {
        setMembers(previous);
        return;
      }
      onSaved?.();
      router.refresh();
    });
  }

  function parse() {
    setError(null);
    setNotice(null);
    startParse(async () => {
      const result = await parseJudgeNamesText(text);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setUnparsed(result.unparsed);
      setFound(toSlots(result.names.map((slot) => [slot])));
    });
  }

  function addFound() {
    if (!found) return;
    const picked = found.flat().filter((s) => s.selectedId);
    const skipped = found.flat().length - picked.length;
    const have = new Set(members.map((m) => m.id));
    const added: Member[] = [];
    for (const s of picked) {
      if (have.has(s.selectedId!)) continue;
      have.add(s.selectedId!);
      added.push({ id: s.selectedId!, name: s.selectedName ?? s.input });
    }
    save([...members, ...added], () => {
      setNotice(t.events.addedJudges(added.length, skipped));
      setFound(null);
      setUnparsed([]);
      setText('');
    });
  }

  const resolve = (input: string, patch: Partial<Slot>) => setFound((prev) => prev && applyResolution(prev, input, patch));

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-gray-600">{t.events.judgesListHelp}</p>

      <div className="flex flex-col gap-2">
        {members.length === 0 && <p className="text-gray-500">{t.events.noJudgesListed}</p>}
        {members.length > 0 && (
          <ul className="grid max-h-80 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-0.5">
                <span>
                  {m.name}
                  {m.country && <span className="ml-1 text-xs text-gray-500">{m.country}</span>}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(members.filter((x) => x.id !== m.id))}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <PlayerPicker
          onPick={(p) => !pending && !members.some((m) => m.id === p.id) && save([...members, p])}
          placeholder={t.events.addJudgePlaceholder}
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={t.events.judgesPastePlaceholder}
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
      {error && <p className="text-red-600">{error}</p>}
      {notice && <p className="text-green-700">{notice}</p>}

      {found && (
        <div className="flex flex-col gap-2">
          {found.length === 0 && <p className="text-gray-500">{t.events.noJudgeNamesFound}</p>}
          <TeamsReview teams={found} update={(change) => setFound((prev) => prev && change(prev))} resolve={resolve} onError={setError} hideTeamLabel />
          {unparsed.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <div className="font-medium text-amber-800">{t.events.couldntParse}</div>
              <ul className="list-disc pl-5 text-amber-900">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {found.length > 0 && (
            <button
              type="button"
              onClick={addFound}
              disabled={pending || !found.flat().some((s) => s.selectedId)}
              className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? t.events.addingJudges : t.events.addJudges}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
