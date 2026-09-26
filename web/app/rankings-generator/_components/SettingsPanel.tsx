'use client';

import { useState } from 'react';
import { saveDefaultParams } from '@/lib/rankings-generator-actions';
import { DEFAULT_PARAMS, type ParamProblem, type PointsParams } from '@/lib/points/params';
import {
  DEFAULT_ROUND_ORDER_HELP,
  RANKING_LISTS,
  RANKING_NUMBERS,
  RATING_NUMBERS,
  getPath,
  setPath,
  type ListFieldDef,
  type NumberFieldDef,
} from './paramFields';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
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
        {def.label}
        {!same(value, getPath(saved, def.path)) && <span className="text-xs font-normal text-blue-700">changed</span>}
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
        {def.help} Default {String(fallback)}.
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
        {def.label}
        {!same(list, getPath(saved, def.path)) && <span className="text-xs font-normal text-blue-700">changed</span>}
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((name) => (
          <li key={name} className="flex items-center gap-1 rounded bg-gray-200 py-0.5 pl-2 pr-1 text-xs dark:bg-white/15">
            {name}
            <button
              type="button"
              onClick={() => onChange(def.path, list.filter((n) => n !== name))}
              aria-label={`Remove ${name}`}
              className="cursor-pointer rounded px-1 text-gray-600 hover:bg-gray-300 dark:text-gray-300 dark:hover:bg-white/20"
            >
              ×
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-gray-500">None</li>}
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
          placeholder="Add a name"
          className={`${inputClass} ${problem ? 'border-red-500' : ''}`}
        />
        <button type="button" onClick={add} className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-white/10">
          Add
        </button>
      </div>
      <span className="text-xs text-gray-500">{def.help}</span>
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
          Save as my defaults
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
          Reset to the original PointsService values
        </button>
        {changed && <span className="text-sm text-blue-700">Changes are used in the preview and when publishing, but not saved yet.</span>}
        {message && <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</span>}
      </div>
      {problems.length > 0 && <p className="text-sm text-red-700">Fix the marked settings: the preview waits until they are all valid.</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Both</h2>
        <label className="flex max-w-xl flex-col gap-1 text-sm">
          <span className="font-medium">Round order</span>
          <select
            value={params.roundOrder}
            onChange={(e) => onChange({ ...params, roundOrder: e.target.value as PointsParams['roundOrder'] })}
            className={inputClass}
          >
            <option value="legacy">PointsService order (Finals first, then the earliest round on)</option>
            <option value="best-first">Furthest round reached</option>
          </select>
          <span className="text-xs text-gray-500">{DEFAULT_ROUND_ORDER_HELP}</span>
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Rankings</h2>
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
        <h2 className="text-lg font-semibold">Ratings</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RATING_NUMBERS.map((def) => (
            <NumberField key={def.path} def={def} params={params} saved={saved} problems={problems} onChange={setNumber} />
          ))}
        </div>
        {params.ratings.kMajor === 64 && params.ratings.kWorlds === 48 && (
          <p className="text-xs text-gray-500">These K values are the ones PointsService actually used (its code swapped major and worlds).</p>
        )}
      </section>
    </div>
  );
}
