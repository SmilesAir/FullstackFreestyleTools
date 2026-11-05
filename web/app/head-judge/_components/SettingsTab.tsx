'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removePreset, saveAsPreset, saveEventPreset, saveSettings } from '@/lib/judging-settings-actions';
import { OFFICIAL_PRESET, defaultSettings, sameSettings, type Preset, type SystemSettings } from '@/lib/judging-settings';
import { CategoryForm } from './CategoryForm';
import { LineForm } from './LineForm';
import { LINE_MAX_KEY, parseDraft, toDraft, type Draft } from './settingsDraft';
import { useT } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionaries';

// The head judge's tunables for the selected event, one form per judging
// system the event uses. Each form keeps its own draft. Opens on `current`,
// the rules the event is on now. The event's results already in are rescored
// with each save.
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
  const t = useT();
  const [active, setActive] = useState(current);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t.headJudge.judgingSettings}</h2>
        <p className="text-sm text-gray-500">{t.headJudge.eventOnly}</p>
        <p className="text-sm text-gray-500">{t.headJudge.rescoreNote}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t.headJudge.judgingSystem}>
        <span className="text-sm text-gray-500">{t.headJudge.judgingSystem}</span>
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

// How many scores a save rescored (none = nothing to say).
const rescoredNote = (t: Dictionary, rescored: number | undefined) => t.headJudge.rescored(rescored ?? 0);

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
  const t = useT();
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
  const eventPreset = presets.find((p) => p.eventId === eventId);
  const outsidePreset = eventPreset !== undefined && !sameSettings(eventPreset.settings, saved);
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
      setMessage(t.headJudge.settingsSaved(rescoredNote(t, result.rescored)));
      router.refresh();
    });
  }

  function updateEventPreset() {
    if (!parsed) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveEventPreset(eventId, rulesId, parsed);
      if (result.error) return setError(result.error);
      setMessage(t.headJudge.savedToPreset(rescoredNote(t, result.rescored)));
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
      setMessage(t.headJudge.loadedPreset(chosen.name, rescoredNote(t, result.rescored)));
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
      setMessage(t.headJudge.savedPreset(replacing, trimmedName));
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
      setMessage(t.headJudge.deletedPreset(chosen.name));
      setPresetId('');
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded border border-gray-300 p-3">
        <h3 className="font-medium">{t.headJudge.eventPreset}</h3>
        {eventPreset ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {t.headJudge.thisEventsPreset} <span className="font-medium">{eventPreset.name}</span>
              </span>
              <button
                type="button"
                onClick={updateEventPreset}
                disabled={!parsed || pending || (!dirty && !outsidePreset)}
                className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.headJudge.updateEventPreset}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {t.headJudge.presetLoadsBack}
            </p>
            {outsidePreset && (
              <p className="text-sm text-amber-700">
                {t.headJudge.notInPreset}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">
            {t.headJudge.presetMadeLater(OFFICIAL_PRESET)}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <h3 className="font-medium">{t.headJudge.presetsFor(rulesId)}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chosen ? presetId : ''}
            onChange={(e) => {
              setPresetId(e.target.value);
              setConfirmDelete(false);
            }}
            aria-label={t.headJudge.preset}
            className="min-w-48 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm"
          >
            <option value="">{presets.length === 0 ? t.headJudge.noPresets : t.headJudge.choosePreset}</option>
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
            {t.headJudge.load}
          </button>
          {chosen &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                {t.headJudge.deleteConfirm(chosen.name)}
                <button type="button" onClick={deleteChosen} disabled={pending} className="cursor-pointer text-red-700 underline">
                  {t.headJudge.yes}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer underline">
                  {t.headJudge.no}
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="cursor-pointer text-sm text-gray-500 underline">
                {t.headJudge.delete}
              </button>
            ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t.headJudge.presetNamePlaceholder}
            aria-label={t.headJudge.presetName}
            className="w-64 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={savePreset}
            disabled={!parsed || trimmedName === '' || pending}
            className="cursor-pointer rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {replacing ? t.headJudge.replacePreset(trimmedName) : t.headJudge.saveAsPreset}
          </button>
          {replacing && <span className="text-sm text-amber-700">{t.headJudge.presetExists}</span>}
        </div>

        <p className="text-xs text-gray-500">
          {t.headJudge.presetHelp}
          {matching && (
            <>
              {' '}
              <span className="font-medium text-gray-700">{t.headJudge.matchesPreset(matching.name)}</span>
            </>
          )}
        </p>
      </section>

      <CategoryForm
        category="Ex"
        title={t.judging.category.Ex}
        blurb={t.headJudge.exBlurb}
        draft={draft}
        defaults={defaultSettings(rulesId)}
        onEdit={edit}
      />

      <CategoryForm
        category="AI"
        title={t.judging.category.AI}
        blurb={t.headJudge.aiBlurb}
        draft={draft}
        defaults={defaultSettings(rulesId)}
        onEdit={edit}
      />

      <CategoryForm
        category="Diff"
        title={t.judging.category.Diff}
        blurb={t.headJudge.diffBlurb}
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
            {t.headJudge.saveSettings}
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
            {t.headJudge.resetDefaults}
          </button>
          {dirty && parsed && <span className="text-sm text-amber-700">{t.headJudge.unsaved}</span>}
          {!parsed && <span className="text-sm text-red-700">{t.headJudge.fixFields}</span>}
          {message && <span className="text-sm text-green-700">{message}</span>}
          {error && <span className="text-sm text-red-700">{error}</span>}
        </div>
      </section>

    </div>
  );
}
