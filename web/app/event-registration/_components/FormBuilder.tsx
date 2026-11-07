'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import {
  PRESET_KEYS,
  PRESET_TYPES,
  QUESTION_TYPES,
  TYPES_WITH_OPTIONS,
  newQuestionId,
  type PresetKey,
  type PublicForm,
  type Question,
  type QuestionType,
} from '@/lib/registration';
import { saveForm, type MyRegistrationState } from '@/lib/registration-actions';
import { RegistrationForm } from '@/app/_components/registration/RegistrationForm';

// Question types staff can add as their own question (the others come as ready-made ones).
const CUSTOM_TYPES: QuestionType[] = ['text', 'longtext', 'date', 'yesno', 'choice', 'checkboxes'];

// The Form tab: the list of questions to add, the form's own settings and questions,
// and a live preview. `saved` false: the event has no form yet; the first Save makes it.
export function FormBuilder({ form, saved: hasForm }: { form: PublicForm; saved: boolean }) {
  const tr = useT().eventRegistration;
  const router = useRouter();
  const [title, setTitle] = useState(form.title);
  const [intro, setIntro] = useState(form.intro);
  const [isOpen, setIsOpen] = useState(form.isOpen);
  const [questions, setQuestions] = useState<Question[]>(form.questions);
  const [savedJson, setSavedJson] = useState(() => (hasForm ? JSON.stringify([form.title, form.intro, form.isOpen, form.questions]) : ''));
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = JSON.stringify([title, intro, isOpen, questions]);
  const dirty = current !== savedJson;

  const update = (id: string, change: Partial<Question>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...change } : q)));
  const move = (index: number, by: number) =>
    setQuestions((qs) => {
      const next = [...qs];
      const [q] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, q);
      return next;
    });
  const add = (q: Omit<Question, 'id'>) => {
    const id = newQuestionId();
    setQuestions((qs) => [...qs, { ...q, id }]);
    setFocusId(id);
  };
  const addPreset = (key: PresetKey) =>
    add({
      type: PRESET_TYPES[key],
      label: tr.presets[key],
      help: '',
      required: key === 'divisions',
      options: key === 'meals' ? [tr.lunch, tr.dinner] : [],
    });
  const presetAdded = (key: PresetKey) => questions.some((q) => q.type === PRESET_TYPES[key] && q.label === tr.presets[key]);

  const save = () =>
    startTransition(async () => {
      const result = await saveForm(form.eventId, { title, intro, isOpen, questions });
      if (result.error) return setMessage({ error: true, text: result.error });
      setSavedJson(current);
      setMessage({ error: false, text: tr.saved });
      router.refresh();
    });

  const preview = useMemo<PublicForm>(() => ({ ...form, title, intro, isOpen: true, questions }), [form, title, intro, questions]);
  const previewState = useMemo<MyRegistrationState>(
    () => ({ signedIn: true, registrant: { playerId: 'preview', name: tr.previewName, email: null }, registration: null, invites: [], names: {} }),
    [tr.previewName]
  );
  const input = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';
  const addRow = 'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-blue-50';

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr] xl:grid-cols-[16rem_1fr_1fr]">
      {/* The questions that can be added */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-12 lg:self-start">
        <h2 className="text-sm font-semibold">{tr.questionsYouCanAdd}</h2>
        <div className="flex flex-col gap-1">
          <span className="px-2 text-xs font-medium tracking-wide text-gray-500 uppercase">{tr.readyMade}</span>
          {PRESET_KEYS.map((key) => (
            <button key={key} type="button" onClick={() => addPreset(key)} className={addRow}>
              <span className="text-sm text-blue-700">
                + {tr.presets[key]}
                {presetAdded(key) && <span className="ml-1 text-xs text-green-700">✓</span>}
              </span>
              <span className="text-xs text-gray-500">{tr.presetHelp[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="px-2 text-xs font-medium tracking-wide text-gray-500 uppercase">{tr.yourOwnQuestion}</span>
          {CUSTOM_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add({ type, label: '', help: '', required: false, options: [] })}
              className={addRow}
            >
              <span className="text-sm text-blue-700">+ {tr.types[type]}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* The form itself */}
      <div className="flex min-w-0 flex-col gap-5">
        {!hasForm && <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{tr.newFormNote}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
          <span className="font-medium">{tr.openForRegistration}</span>
        </label>
        <p className="-mt-3 text-xs text-gray-500">{tr.openHelp}</p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{tr.formTitle}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={form.eventName} className={input} maxLength={200} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{tr.intro}</span>
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder={tr.introPlaceholder} rows={3} className={input} maxLength={4000} />
        </label>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tr.questions}</h2>
          <p className="text-xs text-gray-500">{tr.nameAlwaysAsked}</p>
          {questions.length === 0 && <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">{tr.noQuestions}</p>}
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              autoFocus={q.id === focusId}
              first={i === 0}
              last={i === questions.length - 1}
              onChange={(change) => update(q.id, change)}
              onMove={(by) => move(i, by)}
              onRemove={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
            />
          ))}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-background py-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-default disabled:opacity-50"
          >
            {pending ? tr.saving : tr.save}
          </button>
          {dirty && <span className="text-xs text-amber-700">{hasForm ? tr.unsaved : tr.notSavedYet}</span>}
          {message && (message.error || !dirty) && <span className={`text-xs ${message.error ? 'text-red-600' : 'text-green-700'}`}>{message.text}</span>}
        </div>
      </div>

      {/* Preview */}
      <div className="flex min-w-0 flex-col gap-2 lg:col-start-2 xl:col-start-auto">
        <h2 className="text-sm font-semibold">{tr.preview}</h2>
        <p className="text-xs text-gray-500">{tr.previewHelp}</p>
        <div className="rounded-lg border border-gray-200 shadow-sm xl:sticky xl:top-12">
          <RegistrationForm form={preview} initial={previewState} mode="preview" />
        </div>
      </div>
    </div>
  );
}

function QuestionEditor({
  q,
  autoFocus,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  q: Question;
  autoFocus: boolean;
  first: boolean;
  last: boolean;
  onChange: (change: Partial<Question>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const tr = useT().eventRegistration;
  const input = 'w-full rounded border border-gray-300 px-2 py-1.5 text-sm';
  const small = 'cursor-pointer rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-default disabled:opacity-30';
  // Options are edited as lines of text, kept as typed (blank lines and all).
  const [optionsText, setOptionsText] = useState(q.options.join('\n'));

  return (
    <div className="flex flex-col gap-2 rounded border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={q.type}
          onChange={(e) => onChange({ type: e.target.value as QuestionType })}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
          aria-label={tr.questionType}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {tr.types[type]}
            </option>
          ))}
        </select>
        <div role="group" aria-label={tr.mandatoryOrOptional} className="flex overflow-hidden rounded border border-gray-300 text-xs">
          {[true, false].map((required) => (
            <button
              key={String(required)}
              type="button"
              onClick={() => onChange({ required })}
              aria-pressed={q.required === required}
              className={`cursor-pointer px-2 py-1 ${q.required === required ? (required ? 'bg-red-600 text-white' : 'bg-gray-700 text-white') : 'hover:bg-gray-50'}`}
            >
              {required ? tr.mandatory : tr.optionalLabel}
            </button>
          ))}
        </div>
        <span className="ml-auto flex">
          <button type="button" className={small} onClick={() => onMove(-1)} disabled={first} aria-label={tr.moveUp}>
            ↑
          </button>
          <button type="button" className={small} onClick={() => onMove(1)} disabled={last} aria-label={tr.moveDown}>
            ↓
          </button>
          <button type="button" className={`${small} text-red-600`} onClick={onRemove} aria-label={tr.removeQuestion}>
            ✕
          </button>
        </span>
      </div>
      <input
        value={q.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder={tr.questionText}
        className={input}
        maxLength={300}
        autoFocus={autoFocus}
      />
      <input value={q.help} onChange={(e) => onChange({ help: e.target.value })} placeholder={tr.helpText} className={`${input} text-xs`} maxLength={1000} />
      {TYPES_WITH_OPTIONS.includes(q.type) && (
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          {q.type === 'meals' ? tr.mealOptions : tr.choices}
          <textarea
            value={optionsText}
            onChange={(e) => {
              setOptionsText(e.target.value);
              onChange({ options: [...new Set(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))] });
            }}
            rows={3}
            className={input}
          />
        </label>
      )}
      {tr.typeHelp[q.type] && <p className="text-xs text-gray-500">{tr.typeHelp[q.type]}</p>}
    </div>
  );
}
