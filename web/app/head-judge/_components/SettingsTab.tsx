'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removePreset, saveAsPreset, saveSettings } from '@/lib/judging-settings-actions';
import { defaultSettings, sameSettings, type Preset, type SystemSettings } from '@/lib/judging-settings';
import { CategoryForm } from './CategoryForm';
import { LineForm } from './LineForm';
import { LINE_MAX_KEY, parseDraft, toDraft, type Draft } from './settingsDraft';

// The head judge's tunables for the selected event, one form per judging
// system the event uses. Each form keeps its own draft. Opens on `current`,
// the rules the event is on now.
export function SettingsTab({
  eventId,
  systems,
  current,
  saved,
  presets,
}: {
  eventId: string;
  systems: string[];
  current: string;
  saved: Record<string, SystemSettings>;
  presets: Preset[];
}) {
  const [active, setActive] = useState(current);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Judging settings</h2>
        <p className="text-sm text-gray-500">These values apply to this event only.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Judging system">
        <span className="text-sm text-gray-500">Judging system</span>
        {systems.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === active}
            onClick={() => setActive(id)}
            className={`cursor-pointer rounded border px-3 py-1 text-sm ${
              id === active ? 'border-black bg-black text-white' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {systems.map((id) => (
        <div key={id} hidden={id !== active}>
          <SystemForm
            eventId={eventId}
            rulesId={id}
            saved={saved[id]}
            presets={presets.filter((p) => p.rulesId === id)}
          />
        </div>
      ))}
    </div>
  );
}

function SystemForm({
  eventId,
  rulesId,
  saved,
  presets,
}: {
  eventId: string;
  rulesId: string;
  saved: SystemSettings;
  presets: Preset[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The draft starts from what the event has, and starts over when that changes.
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [seenKey, setSeenKey] = useState(savedKey);
  // (A draft made before Difficulty's fields existed starts over too.)
  const outdated = draft[LINE_MAX_KEY] === undefined && saved.Diff?.line !== undefined;
  if (seenKey !== savedKey || outdated) {
    setSeenKey(savedKey);
    setDraft(toDraft(saved));
  }

  const [presetId, setPresetId] = useState('');
  const [name, setName] = useState('');
  const [replaceName, setReplaceName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDraft(draft);
  const dirty = parsed === null || !sameSettings(parsed, saved);
  const matching = parsed ? presets.find((p) => sameSettings(p.settings, parsed)) : undefined;
  const chosen = presets.find((p) => p.id === presetId);
  const trimmedName = name.trim();
  const replacing = replaceName !== null && replaceName.toLowerCase() === trimmedName.toLowerCase();

  function edit(key: string, text: string) {
    setDraft((current) => ({ ...current, [key]: text }));
    setMessage(null);
  }

  function changeDraft(change: (draft: Draft) => Draft) {
    setDraft(change);
    setMessage(null);
  }

  function save() {
    if (!parsed) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSettings(eventId, rulesId, parsed);
      if (result.error) return setError(result.error);
      setMessage('Settings saved');
      router.refresh();
    });
  }

  function load() {
    if (!chosen) return;
    setError(null);
    setMessage(null);
    setDraft(toDraft(chosen.settings));
    startTransition(async () => {
      const result = await saveSettings(eventId, rulesId, chosen.settings);
      if (result.error) return setError(result.error);
      setMessage(`Loaded "${chosen.name}" and applied it to this event`);
      router.refresh();
    });
  }

  function savePreset() {
    if (!parsed) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveAsPreset(rulesId, trimmedName, parsed, replacing);
      if (result.error) return setError(result.error);
      if (result.exists) {
        setReplaceName(trimmedName);
        return;
      }
      setMessage(`${replacing ? 'Replaced' : 'Saved'} preset "${trimmedName}"`);
      setName('');
      setReplaceName(null);
      router.refresh();
    });
  }

  function deleteChosen() {
    if (!chosen) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removePreset(chosen.id);
      if (result.error) return setError(result.error);
      setMessage(`Deleted preset "${chosen.name}"`);
      setPresetId('');
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <h3 className="font-medium">Presets for {rulesId}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chosen ? presetId : ''}
            onChange={(e) => {
              setPresetId(e.target.value);
              setConfirmDelete(false);
            }}
            aria-label="Preset"
            className="min-w-48 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm"
          >
            <option value="">{presets.length === 0 ? 'No presets saved yet' : 'Choose a preset'}</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={!chosen || pending}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load
          </button>
          {chosen &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete &quot;{chosen.name}&quot;?
                <button type="button" onClick={deleteChosen} disabled={pending} className="cursor-pointer text-red-700 underline">
                  Yes
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer underline">
                  No
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="cursor-pointer text-sm text-gray-500 underline">
                Delete
              </button>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Name for a new preset"
            aria-label="Preset name"
            className="w-64 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={savePreset}
            disabled={!parsed || trimmedName === '' || pending}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {replacing ? `Replace "${trimmedName}"` : 'Save as preset'}
          </button>
          {replacing && <span className="text-sm text-amber-700">A preset with this name exists. Click again to replace it.</span>}
        </div>

        <p className="text-xs text-gray-500">
          Saving a preset stores the values below. Loading one applies it to this event straight away.
          {matching && (
            <>
              {' '}
              <span className="font-medium text-gray-700">Matches preset: {matching.name}.</span>
            </>
          )}
        </p>
      </section>

      <CategoryForm
        category="Ex"
        title="Execution"
        blurb="What each note is worth when the judge's notes are drawn as a graph. Errors are usually negative and clean completions positive."
        draft={draft}
        defaults={defaultSettings(rulesId)}
        onEdit={edit}
      />

      <CategoryForm
        category="AI"
        title="Artistic Impression"
        blurb="What each note is worth when the judge's notes are drawn as a graph. Notes are grouped by area."
        draft={draft}
        defaults={defaultSettings(rulesId)}
        onEdit={edit}
      />

      <CategoryForm
        category="Diff"
        title="Difficulty"
        blurb="Each rating is a multiplier of the numberline score of the move it rates (Bad, Average, Good)."
        draft={draft}
        defaults={defaultSettings(rulesId)}
        onEdit={edit}
      >
        <LineForm draft={draft} defaults={defaultSettings(rulesId)} onEdit={edit} onChange={changeDraft} />
      </CategoryForm>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!parsed || !dirty || pending}
            className="cursor-pointer rounded bg-black px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(toDraft(defaultSettings(rulesId)));
              setMessage(null);
            }}
            disabled={pending}
            className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Reset to defaults
          </button>
          {dirty && parsed && <span className="text-sm text-amber-700">Unsaved changes</span>}
          {!parsed && <span className="text-sm text-red-700">Fix the highlighted fields to save.</span>}
          {message && <span className="text-sm text-green-700">{message}</span>}
          {error && <span className="text-sm text-red-700">{error}</span>}
        </div>
      </section>

    </div>
  );
}
