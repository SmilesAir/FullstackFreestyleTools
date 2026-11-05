'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateDivisionSettings, deleteDivision } from '@/lib/event-creator-actions';
import { OFFERED_RULES_IDS, ROUTINE_MINUTES, defaultRoutineSeconds } from '@/lib/event-creator';
import type { PlayerRef } from '@/lib/event-creator-queries';
import { PlayerPicker } from '../PlayerPicker';
import { useT } from '@/lib/i18n/client';

export function DivisionSettings({
  eventId,
  divisionId,
  divisionName: initialName,
  availableNames,
  routineSeconds: initialRoutine,
  rulesId: initialRules,
  headJudge: initialHead,
  directors: initialDirectors,
}: {
  eventId: string;
  divisionId: string;
  divisionName: string;
  availableNames: string[];
  routineSeconds: number;
  rulesId: string;
  headJudge: PlayerRef | null;
  directors: PlayerRef[];
}) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState(initialName);
  const [routineMinutes, setRoutineMinutes] = useState(Math.round(initialRoutine / 60));
  const [rules, setRules] = useState(initialRules);
  // A division already on rules that are no longer offered keeps them listed,
  // so saving other settings doesn't quietly switch its rules.
  const offered: readonly string[] = OFFERED_RULES_IDS;
  const rulesOptions = offered.includes(initialRules) ? offered : [...offered, initialRules];

  // Switching type moves the routine time to the new type's default, but only
  // if it was still on the old type's default (don't clobber a deliberate choice).
  function changeName(next: string) {
    if (routineMinutes * 60 === defaultRoutineSeconds(name)) {
      setRoutineMinutes(defaultRoutineSeconds(next) / 60);
    }
    setName(next);
  }
  const [head, setHead] = useState<{ id: string; name: string } | null>(
    initialHead ? { id: initialHead.id, name: initialHead.name } : null
  );
  const [directors, setDirectors] = useState<{ id: string; name: string }[]>(
    initialDirectors.map((d) => ({ id: d.id, name: d.name }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateDivisionSettings(divisionId, {
        divisionName: name,
        routineMinutes,
        rulesId: rules,
        headJudgeId: head?.id ?? null,
        directorIds: directors.map((d) => d.id),
      });
      setError(result.error);
      setSaved(!result.error);
      if (!result.error) router.refresh();
    });
  }

  function remove() {
    if (!confirm(t.events.deleteDivisionConfirm)) return;
    startTransition(async () => {
      const result = await deleteDivision(divisionId);
      if (result.error) return setError(result.error);
      router.push(`/events?event=${eventId}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t.events.divisionType}
          <select value={name} onChange={(e) => changeName(e.target.value)} className="w-48 rounded border border-gray-300 px-2 py-1">
            {availableNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t.events.routineTime}
          <select
            value={routineMinutes}
            onChange={(e) => setRoutineMinutes(Number(e.target.value))}
            className="w-32 rounded border border-gray-300 px-2 py-1"
          >
            {ROUTINE_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t.events.minutes(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        {t.events.rules}
        <select
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          className="w-48 rounded border border-gray-300 px-2 py-1"
        >
          {rulesOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        {t.events.headJudge}
        {head ? (
          <div className="flex items-center gap-2">
            <span>{head.name}</span>
            <button type="button" onClick={() => setHead(null)} className="text-xs text-red-600 underline">
              {t.events.remove}
            </button>
          </div>
        ) : (
          <PlayerPicker onPick={setHead} placeholder={t.events.searchHeadJudge} />
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {t.events.directors}
        {directors.map((d) => (
          <div key={d.id} className="flex items-center gap-2">
            <span>{d.name}</span>
            <button
              type="button"
              onClick={() => setDirectors(directors.filter((x) => x.id !== d.id))}
              className="text-xs text-red-600 underline"
            >
              {t.events.remove}
            </button>
          </div>
        ))}
        <PlayerPicker
          onPick={(p) => setDirectors(directors.some((d) => d.id === p.id) ? directors : [...directors, p])}
          placeholder={t.events.addDirector}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {t.events.saveSettings}
        </button>
        {saved && <span className="text-xs text-green-700">{t.events.saved}</span>}
        <button type="button" onClick={remove} disabled={pending} className="ml-auto text-xs text-red-600 underline disabled:opacity-50">
          {t.events.deleteDivision}
        </button>
      </div>
    </div>
  );
}
