'use client';

import { noteGroups, type NoteCategory } from '@/lib/judging';
import {
  AREA_SCALE_STEP,
  hasScoreLimit,
  POWER_STEP,
  SECONDS_PER_SCORE_STEP,
  weightRange,
  weightStep,
  type SystemSettings,
} from '@/lib/judging-settings';
import { NOTE_STYLE } from '@/app/judge/_components/noteStyles';
import { fieldKey, rangeOf, validText, type Draft } from './settingsDraft';

const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v)}`;
// Difficulty's values are multipliers.
const shown = (category: NoteCategory, v: number) => (category === 'Diff' ? `×${v}` : signed(v));

// One judge category's tunables on the Settings tab: what each note is worth
// (under its area heading, if it has areas) and the baseline estimate's two
// coefficients. The fields are edited in `draft` and saved by the tab.
export function CategoryForm({
  category,
  title,
  blurb,
  draft,
  defaults,
  onEdit,
  children,
}: {
  category: NoteCategory;
  title: string;
  blurb: string;
  draft: Draft;
  defaults: SystemSettings;
  onEdit: (key: string, text: string) => void;
  // Shown under the blurb, before the notes' values.
  children?: React.ReactNode;
}) {
  const [minWeight, maxWeight] = weightRange(category);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-500">
        {blurb} Allowed range {minWeight} to {maxWeight}.
      </p>

      {children}

      {noteGroups(category).map((group) => (
        <div key={group.heading ?? 'notes'} className="flex flex-col gap-2">
          {group.heading && (
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{group.heading}</h4>
          )}
          <ul className="flex flex-col gap-2">
            {group.notes.map((note) => {
              const key = fieldKey(category, note.type);
              const invalid = !validText(draft, key);
              return (
                <li key={note.type} className="flex flex-wrap items-center gap-3">
                  <span className={`w-52 rounded px-3 py-1.5 text-sm font-semibold ${NOTE_STYLE[note.type]}`}>
                    {note.label}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={weightStep(category)}
                    min={minWeight}
                    max={maxWeight}
                    value={draft[key]}
                    onChange={(e) => onEdit(key, e.target.value)}
                    aria-label={`${note.fullLabel} weight`}
                    aria-invalid={invalid}
                    className={`w-28 rounded border bg-transparent px-2 py-1 ${invalid ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  <span className="text-sm text-gray-500">default {shown(category, defaults[category].noteWeights[note.type])}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <h4 className="mt-2 font-medium">{title} baseline estimate</h4>
      <p className="text-sm text-gray-500">
        The suggested score is the area under the notes&apos; curve over the routine, times the coefficient. The power
        raises the curve&apos;s height first: 1 is the plain area, above 1 gives extra credit to notes that come close
        together.
      </p>
      <ul className="flex flex-col gap-2">
        {(
          [
            ['areaScale', 'Area coefficient', AREA_SCALE_STEP],
            ['power', 'Cluster power', POWER_STEP],
          ] as const
        ).map(([field, label, step]) => {
          const key = fieldKey(category, field);
          const invalid = !validText(draft, key);
          const [min, max] = rangeOf(key);
          return (
            <li key={field} className="flex flex-wrap items-center gap-3">
              <span className="w-52 text-sm font-medium">{label}</span>
              <input
                type="number"
                inputMode="decimal"
                step={step}
                min={min}
                max={max}
                value={draft[key]}
                onChange={(e) => onEdit(key, e.target.value)}
                aria-label={`${title} ${label}`}
                aria-invalid={invalid}
                className={`w-28 rounded border bg-transparent px-2 py-1 ${invalid ? 'border-red-500' : 'border-gray-300'}`}
              />
              <span className="text-sm text-gray-500">
                default {defaults[category].estimate[field]}, range {min} to {max}
              </span>
            </li>
          );
        })}
      </ul>

      {hasScoreLimit(category) && (
        <ScoreLimitField category={category} title={title} draft={draft} defaults={defaults} onEdit={onEdit} />
      )}
    </section>
  );
}

// How many positive notes count toward the baseline: one per this many seconds
// of the routine; the most valuable are kept, the rest are grayed out.
function ScoreLimitField({
  category,
  title,
  draft,
  defaults,
  onEdit,
}: {
  category: NoteCategory;
  title: string;
  draft: Draft;
  defaults: SystemSettings;
  onEdit: (key: string, text: string) => void;
}) {
  const key = fieldKey(category, 'secondsPerScore');
  const invalid = !validText(draft, key);
  const [min, max] = rangeOf(key);
  const seconds = Number(draft[key]);
  const perMinute = !invalid && seconds > 0 ? Math.round((60 / seconds) * 100) / 100 : null;
  return (
    <>
      <h4 className="mt-2 font-medium">{title} score limit</h4>
      <p className="text-sm text-gray-500">
        Only so many positive notes count toward the baseline: one per this many seconds of the routine, anywhere in it.
        The most valuable count; the rest are grayed out on the graph. Negative notes always count. 0 = no limit.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-52 text-sm font-medium">Seconds per score</span>
        <input
          type="number"
          inputMode="decimal"
          step={SECONDS_PER_SCORE_STEP}
          min={min}
          max={max}
          value={draft[key]}
          onChange={(e) => onEdit(key, e.target.value)}
          aria-label={`${title} seconds per score`}
          aria-invalid={invalid}
          className={`w-28 rounded border bg-transparent px-2 py-1 ${invalid ? 'border-red-500' : 'border-gray-300'}`}
        />
        <span className="text-sm text-gray-500">
          {perMinute !== null
            ? `${perMinute} per minute (${Math.floor(180 / seconds)} in a 3:00 routine) · `
            : !invalid
              ? 'no limit · '
              : ''}
          default {defaults[category].secondsPerScore}, range {min} to {max}
        </span>
      </div>
    </>
  );
}
