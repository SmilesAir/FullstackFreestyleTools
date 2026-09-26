'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { previewPoints } from '@/lib/rankings-generator-actions';
import { validateParams, type ParamProblem, type PointsParams } from '@/lib/points/params';
import type { GeneratorEvent } from '@/lib/points/load';
import type { GeneratorOutput } from '@/lib/points/run';
import type { RatingRow } from '@/lib/points/types';
import type { Version } from '@/lib/points-snapshots';
import { EventsPanel, yearsBefore } from './EventsPanel';
import { PreviewPanel, type PreviewTab } from './PreviewPanel';
import { PublishedPanel } from './PublishedPanel';
import { SettingsPanel } from './SettingsPanel';

type Tab = 'events' | 'settings' | 'preview' | 'published';

const TABS: { id: Tab; label: string }[] = [
  { id: 'events', label: 'Events' },
  { id: 'settings', label: 'Settings' },
  { id: 'preview', label: 'Preview' },
  { id: 'published', label: 'Published' },
];

// How long to wait after a change before recalculating (each change of a checkbox or
// a settings box would otherwise start one).
const DEBOUNCE_MS = 600;

// Holds what the four tabs share: which events are selected, the settings being
// tried, and the preview they give.
export function GeneratorClient({
  events,
  savedParams,
  versions,
  today,
  local,
}: {
  events: GeneratorEvent[];
  savedParams: PointsParams;
  versions: Version[];
  today: string;
  local: boolean;
}) {
  const [tab, setTab] = useState<Tab>('events');
  const [asOf, setAsOf] = useState(today);
  // The last 2 years to start with, as PointsService's page did.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const from = yearsBefore(today, 2);
    return new Set(events.filter((e) => e.startDate >= from && e.startDate <= today).map((e) => e.id));
  });
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [params, setParams] = useState<PointsParams>(savedParams);
  const [saved, setSaved] = useState<PointsParams>(savedParams);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('open');

  const [output, setOutput] = useState<GeneratorOutput | null>(null);
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<ParamProblem[]>([]);

  const selection = useMemo(
    () => ({ eventIds: [...selected].sort(), excludedDivisionIds: [...excluded].sort() }),
    [selected, excluded]
  );
  const validated = useMemo(() => validateParams(params), [params]);
  const problems = validated.ok ? serverProblems : validated.problems;
  const paramsKey = JSON.stringify(params);
  const selectionKey = JSON.stringify(selection);

  const select = (ids: readonly string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const exclude = (id: string, on: boolean) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // The rankings, recalculated shortly after the selection or the settings change.
  // An answer to an older request is ignored.
  const requestId = useRef(0);
  useEffect(() => {
    if (!validated.ok) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setUpdating(true);
      try {
        const result = await previewPoints({ ...selection, params: validated.params, withRatings: false });
        if (id !== requestId.current) return;
        if (result.ok) {
          setOutput(result.output);
          setError(null);
          setServerProblems([]);
        } else {
          setError(result.error);
          setServerProblems(result.problems ?? []);
        }
      } catch {
        if (id === requestId.current) setError('No answer from the server. Try again.');
      } finally {
        if (id === requestId.current) setUpdating(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The keys stand for selection and params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, paramsKey]);

  // The ratings depend on the settings only, and are worked out when the ratings tab is open.
  const ratingsRequest = useRef(0);
  const ratingsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!validated.ok || previewTab !== 'ratings' || tab !== 'preview') return;
    if (ratingsFor.current === paramsKey && ratings) return;
    const id = ++ratingsRequest.current;
    const timer = setTimeout(async () => {
      try {
        const result = await previewPoints({ ...selection, params: validated.params, withRatings: true });
        if (id !== ratingsRequest.current) return;
        if (result.ok) {
          setRatings(result.output.ratings);
          ratingsFor.current = paramsKey;
          setError(null);
        } else {
          setError(result.error);
        }
      } catch {
        if (id === ratingsRequest.current) setError('No answer from the server. Try again.');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewTab, tab, paramsKey]);

  // Settings changed: the ratings shown are out of date.
  const changeParams = (next: PointsParams) => {
    ratingsFor.current = null;
    setRatings(null);
    setParams(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-300">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'events' && <span className="ml-1.5 text-xs opacity-70">{selected.size}</span>}
            {t.id === 'settings' && problems.length > 0 && <span className="ml-1.5 text-xs text-red-600">!</span>}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <EventsPanel events={events} params={params} selected={selected} excluded={excluded} asOf={asOf} onAsOf={setAsOf} onSelect={select} onExclude={exclude} />
      )}
      {tab === 'settings' && <SettingsPanel params={params} saved={saved} problems={problems} onChange={changeParams} onSaved={setSaved} />}
      {tab === 'preview' && (
        <PreviewPanel
          tab={previewTab}
          onTab={setPreviewTab}
          output={validated.ok ? output : null}
          ratings={ratings}
          updating={updating}
          error={validated.ok ? error : 'Some settings are not valid: fix them on the Settings tab.'}
          topResults={params.rankings.topResults}
        />
      )}
      {tab === 'published' && (
        <PublishedPanel versions={versions} today={today} local={local} selection={selection} params={params} paramsValid={validated.ok} />
      )}
    </div>
  );
}
