'use client';

import { useState } from 'react';
import { saveDefaultParams } from '@/lib/rankings-generator-actions';
import { DEFAULT_PARAMS, type ParamProblem, type PointsParams } from '@/lib/points/params';
import {
  RANKING_LISTS,
  RANKING_NUMBERS,
  RATING_NUMBERS,
  getPath,
  setPath,
  type ListFieldDef,
  type NumberFieldDef,
} from './paramFields';
import { useT } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// A setting's name and help in the viewer's language (paramFields.ts holds the English).
const fieldText = (t: Dictionary, def: { path: string; label: string; help: string }) =>
  (t.rankings.fields as Record<string, { label: string; help: string }>)[def.path] ?? def;
const inputClass = 'w-full rounded border border-gray-300 bg-background px-2 py-1.5 text-sm tabular-nums';

function NumberField({
  def,
  params,
  saved,
  problems,
  onChange,
}: {
  def: NumberFieldDef;
  params: PointsParams;
  saved: PointsParams;
  problems: ParamProblem[];
  onChange: (path: string, value: number) => void;
}) {
  const t = useT();
  const value = getPath(params, def.path);
  const fallback = getPath(DEFAULT_PARAMS, def.path);
  const problem = problems.find((p) => p.path === def.path);
  // The text is kept as typed, so "4." or an empty box doesn't jump around.
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (!Object.is(value, lastValue)) {
    setLastValue(value);
    // Changed from outside (a reset): show it. What was typed already is that value: leave it.
    const typed = text.trim() === '' ? NaN : Number(text);
    if (!Object.is(typed, value)) setText(String(value));
  }
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-2 font-medium">
        {fieldText(t, def).label}
        {!same(value, getPath(saved, def.path)) && <span className="text-xs font-normal text-blue-700">{t.rankings.changed}</span>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(def.path, e.target.value.trim() === '' ? NaN : Number(e.target.value));
        }}
        className={`${inputClass} ${problem ? 'border-red-500' : ''}`}
      />
      <span className="text-xs text-gray-500">
        {fieldText(t, def).help} {t.rankings.defaultValue(String(fallback))}
      </span>
      {problem && <span className="text-xs text-red-700">{problem.message}</span>}
    </label>
  );
}

function ListField({
  def,
  params,
  saved,
  problems,
  onChange,
}: {
  def: ListFieldDef;
  params: PointsParams;
  saved: PointsParams;
  problems: ParamProblem[];
  onChange: (path: string, value: string[]) => void;
}) {
  const t = useT();
  const list = (getPath(params, def.path) as string[]) ?? [];
  const [draft, setDraft] = useState('');
  const problem = problems.find((p) => p.path === def.path);
  const add = () => {
    const name = draft.trim();
    if (!name || list.includes(name)) return;
    onChange(def.path, [...list, name]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline justify-between gap-2 font-medium">
        {fieldText(t, def).label}
        {!same(list, getPath(saved, def.path)) && <span className="text-xs font-normal text-blue-700">{t.rankings.changed}</span>}
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((name) => (
          <li key={name} className="flex items-center gap-1 rounded bg-gray-200 py-0.5 pl-2 pr-1 text-xs dark:bg-white/15">
            {name}
            <button
              type="button"
              onClick={() => onChange(def.path, list.filter((n) => n !== name))}
              aria-label={t.rankings.remove(name)}
              className="cursor-pointer rounded px-1 text-gray-600 hover:bg-gray-300 dark:text-gray-300 dark:hover:bg-white/20"
            >
              ×
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-gray-500">{t.rankings.none}</li>}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t.rankings.addName}
          className={`${inputClass} ${problem ? 'border-red-500' : ''}`}
        />
        <button type="button" onClick={add} className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-white/10">
          {t.rankings.add}
        </button>
      </div>
      <span className="text-xs text-gray-500">{fieldText(t, def).help}</span>
      {problem && <span className="text-xs text-red-700">{problem.message}</span>}
    </div>
  );
}

// Every tunable of the rankings and ratings. Changes count straight away in the preview
// and in Publish; "Save as my defaults" keeps them for next time.
export function SettingsPanel({
  params,
  saved,
  problems,
  onChange,
  onSaved,
}: {
  params: PointsParams;
  // The values the tool opened with (what "changed" is measured against).
  saved: PointsParams;
  problems: ParamProblem[];
  onChange: (params: PointsParams) => void;
  onSaved: (params: PointsParams) => void;
}) {
  const t = useT();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const setNumber = (path: string, value: number) => onChange(setPath(params, path, value));
  const setList = (path: string, value: string[]) => onChange(setPath(params, path, value));
  const changed = !same(params, saved);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || problems.length > 0 || !changed}
          onClick={async () => {
            setBusy(true);
            const result = await saveDefaultParams(params);
            setBusy(false);
            setMessage({ ok: result.ok, text: result.message });
            if (result.ok) onSaved(params);
          }}
          className="cursor-pointer rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {t.rankings.saveDefaults}
        </button>
        <button
          type="button"
          disabled={busy || same(params, DEFAULT_PARAMS)}
          onClick={() => {
            setMessage(null);
            onChange(DEFAULT_PARAMS);
          }}
          className="cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
        >
          {t.rankings.resetOriginal}
        </button>
        {changed && <span className="text-sm text-blue-700">{t.rankings.unsavedChanges}</span>}
        {message && <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</span>}
      </div>
      {problems.length > 0 && <p className="text-sm text-red-700">{t.rankings.fixSettings}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.rankings.both}</h2>
        <label className="flex max-w-xl flex-col gap-1 text-sm">
          <span className="font-medium">{t.rankings.roundOrder}</span>
          <select
            value={params.roundOrder}
            onChange={(e) => onChange({ ...params, roundOrder: e.target.value as PointsParams['roundOrder'] })}
            className={inputClass}
          >
            <option value="legacy">{t.rankings.legacyOrder}</option>
            <option value="best-first">{t.rankings.bestFirst}</option>
          </select>
          <span className="text-xs text-gray-500">{t.rankings.roundOrderHelp}</span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.rankings.rankingsHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RANKING_NUMBERS.map((def) => (
            <NumberField key={def.path} def={def} params={params} saved={saved} problems={problems} onChange={setNumber} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {RANKING_LISTS.map((def) => (
            <ListField key={def.path} def={def} params={params} saved={saved} problems={problems} onChange={setList} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.rankings.ratingsHeading}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RATING_NUMBERS.map((def) => (
            <NumberField key={def.path} def={def} params={params} saved={saved} problems={problems} onChange={setNumber} />
          ))}
        </div>
        {params.ratings.kMajor === 64 && params.ratings.kWorlds === 48 && (
          <p className="text-xs text-gray-500">{t.rankings.kNote}</p>
        )}
      </section>
    </div>
  );
}
