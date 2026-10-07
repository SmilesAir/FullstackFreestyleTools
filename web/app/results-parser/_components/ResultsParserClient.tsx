'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISION_NAMES } from '@/lib/event-creator';
import {
  createPlayerForResults,
  createResultsEvent,
  loadDivision,
  saveDivisionResults,
  setResultsPublished,
} from '@/lib/results-parser-actions';
import { toSaveRounds, type EditorRound, type EventOption, type ParsedDivision } from '@/lib/results-parser/types';
import { validateResults } from '@/lib/results-parser/validate';
import { ClaudeBox } from './ClaudeBox';
import { RoundsEditor } from './RoundsEditor';
import { useHistory } from './useHistory';

const draftKey = (eventId: string, divisionName: string) => `results-parser-draft:${eventId}:${divisionName}`;

function readDraft(key: string): EditorRound[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as EditorRound[]) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, rounds: EditorRound[] | null) {
  try {
    if (rounds) localStorage.setItem(key, JSON.stringify(rounds));
    else localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage just mean no draft is kept.
  }
}

const same = (a: EditorRound[], b: EditorRound[]) => JSON.stringify(toSaveRounds(a)) === JSON.stringify(toSaveRounds(b));

export function ResultsParserClient({
  events: initialEvents,
  hasKey,
  initialEventId = '',
}: {
  events: EventOption[];
  hasKey: boolean;
  // Deep-linked from the Event Editor (?event=) - preselects the event; division
  // still needs picking by hand, same one-division-at-a-time design as always.
  initialEventId?: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [eventId, setEventId] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [baseline, setBaseline] = useState<EditorRound[]>([]);
  const [saved, setSaved] = useState<{ divisionId: string | null; isHidden: boolean | null }>({ divisionId: null, isHidden: null });
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorRound[] | null>(null);
  const [newEvent, setNewEvent] = useState<{ name: string; start: string; end: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const history = useHistory<EditorRound[]>([]);
  const request = useRef(0);

  const rounds = history.present;
  const problems = useMemo(() => (eventId && divisionName ? validateResults(toSaveRounds(rounds)) : []), [rounds, eventId, divisionName]);
  const dirty = !same(rounds, baseline);
  const key = eventId && divisionName ? draftKey(eventId, divisionName) : null;

  // Keep unsaved work in this browser, so a refresh doesn't lose it.
  useEffect(() => {
    if (key && ready && !draft && !loading) writeDraft(key, dirty ? rounds : null);
  }, [key, ready, draft, loading, dirty, rounds]);

  const counts = useMemo(() => {
    let pools = 0;
    let teams = 0;
    let players = 0;
    for (const r of rounds) for (const p of r.pools) {
      pools++;
      for (const t of p.teams) {
        teams++;
        players += t.players.length;
      }
    }
    return { rounds: rounds.length, pools, teams, players };
  }, [rounds]);

  // Opens an event and division in the editor, optionally with rounds Claude filled in.
  async function open(nextEvent: string, nextDivision: string, initial?: EditorRound[]): Promise<boolean> {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return false;
    const mine = ++request.current;
    setEventId(nextEvent);
    setDivisionName(nextDivision);
    setError(null);
    setNotice(null);
    setDraft(null);
    setReady(false);
    if (!nextEvent || !nextDivision) {
      history.reset([]);
      setBaseline([]);
      setSaved({ divisionId: null, isHidden: null });
      return true;
    }

    setLoading(true);
    const result = await loadDivision(nextEvent, nextDivision);
    if (mine !== request.current) return true;
    setLoading(false);
    if (result.error || !result.loaded) {
      setError(result.error ?? 'Failed to load the division');
      history.reset([]);
      setBaseline([]);
      return true;
    }
    const { loaded } = result;
    setBaseline(loaded.rounds);
    setSaved({ divisionId: loaded.divisionId, isHidden: loaded.isHidden });
    history.reset(loaded.rounds);
    if (initial) {
      history.set(initial);
      setNotice(
        loaded.rounds.length > 0
          ? 'Loaded from Claude. This division already has saved results, and saving replaces them.'
          : 'Loaded from Claude. Check everything, then save.'
      );
    } else {
      const found = readDraft(draftKey(nextEvent, nextDivision));
      if (found && !same(found, loaded.rounds)) setDraft(found);
    }
    setReady(true);
    return true;
  }

  // Deep-linked from the Event Editor: preselect the event once, on mount.
  // Deferred a tick since `open`'s setState calls must not run synchronously
  // within the effect body.
  useEffect(() => {
    if (!initialEventId) return;
    const id = setTimeout(() => void open(initialEventId, ''), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadParsed(division: ParsedDivision) {
    if (!eventId) return;
    if (
      baseline.length > 0 &&
      division.divisionName === divisionName &&
      !window.confirm(`${division.divisionName} already has saved results. Replace them in the editor with Claude's?`)
    ) {
      return;
    }
    void open(eventId, division.divisionName, division.rounds);
  }

  async function submitNewEvent() {
    if (!newEvent) return;
    setCreatingEvent(true);
    setError(null);
    const result = await createResultsEvent(newEvent.name, newEvent.start, newEvent.end);
    setCreatingEvent(false);
    if (result.error || !result.event) {
      setError(result.error ?? 'Failed to create the event');
      return;
    }
    const created = result.event;
    setEvents((prev) => [created, ...prev].sort((a, b) => b.start_date.localeCompare(a.start_date)));
    setNewEvent(null);
    void open(created.id, divisionName);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const result = await saveDivisionResults(eventId, divisionName, toSaveRounds(rounds));
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBaseline(rounds);
    setSaved({ divisionId: result.divisionId ?? null, isHidden: false });
    if (key) writeDraft(key, null);
    setNotice(`Saved ${result.teams} team(s) in ${divisionName}. They count in the Rankings Generator now.`);
  }

  async function togglePublished() {
    if (!saved.divisionId) return;
    const publish = saved.isHidden === true;
    const result = await setResultsPublished(saved.divisionId, publish);
    if (result.error) setError(result.error);
    else setSaved({ ...saved, isHidden: !publish });
  }

  function revert() {
    if (dirty && !window.confirm('Throw away your changes and go back to what is saved?')) return;
    history.reset(baseline);
    setDraft(null);
    setNotice(null);
  }

  const selected = eventId && divisionName;

  return (
    <div className="flex flex-col gap-4">
      <ClaudeBox
        hasKey={hasKey}
        events={events}
        eventId={eventId}
        onPickEvent={(id) => void open(id, divisionName)}
        onCreateEvent={setNewEvent}
        onLoad={loadParsed}
      />

      <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 basis-full flex-col gap-1 text-sm sm:max-w-md sm:flex-1 sm:basis-0">
            <span className="text-xs text-gray-500">Event</span>
            <select
              value={eventId}
              onChange={(e) => void open(e.target.value, divisionName)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Choose an event…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.start_date} · {e.event_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setNewEvent(newEvent ? null : { name: '', start: '', end: '' })}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {newEvent ? 'Cancel new event' : 'Create event'}
          </button>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-gray-500">Division</span>
            <select
              value={divisionName}
              onChange={(e) => void open(eventId, e.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="">Choose a division…</option>
              {DIVISION_NAMES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        {newEvent && (
          <div className="flex flex-wrap items-end gap-3 rounded bg-gray-50 p-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-xs text-gray-500">Event name</span>
              <input
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-gray-500">Start date</span>
              <input
                type="date"
                value={newEvent.start}
                onChange={(e) => setNewEvent({ ...newEvent, start: e.target.value, end: newEvent.end || e.target.value })}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-gray-500">End date</span>
              <input
                type="date"
                value={newEvent.end}
                onChange={(e) => setNewEvent({ ...newEvent, end: e.target.value })}
                className="rounded border border-gray-300 px-2 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={submitNewEvent}
              disabled={creatingEvent || !newEvent.name.trim() || !newEvent.start || !newEvent.end}
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creatingEvent ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {draft && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span>You have unsaved changes for this division from earlier in this browser.</span>
          <button
            type="button"
            onClick={() => {
              history.set(draft);
              setDraft(null);
            }}
            className="rounded border border-amber-400 bg-white px-2 py-1 text-xs"
          >
            Restore them
          </button>
          <button
            type="button"
            onClick={() => {
              if (key) writeDraft(key, null);
              setDraft(null);
            }}
            className="rounded border border-amber-400 bg-white px-2 py-1 text-xs"
          >
            Discard them
          </button>
        </div>
      )}

      {selected && loading && <p className="text-sm text-gray-600">Loading…</p>}

      {selected && !loading && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={history.undo} disabled={!history.canUndo} className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">
              Undo
            </button>
            <button type="button" onClick={history.redo} disabled={!history.canRedo} className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">
              Redo
            </button>
            <button type="button" onClick={revert} disabled={!dirty} className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">
              Revert changes
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty || problems.length > 0}
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save results'}
            </button>
            {saved.divisionId && (
              <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                {saved.isHidden ? 'Saved but hidden (not counted).' : 'Saved and counted.'}
                <button type="button" onClick={togglePublished} className="text-xs text-blue-600 underline">
                  {saved.isHidden ? 'Show it' : 'Hide it'}
                </button>
                <Link href="/rankings-generator" className="text-xs text-blue-600 underline">
                  Rankings Generator
                </Link>
              </span>
            )}
          </div>

          <RoundsEditor
            rounds={rounds}
            mutate={(fn) =>
              history.set((prev) => {
                const draftRounds = structuredClone(prev);
                fn(draftRounds);
                return draftRounds;
              })
            }
            createPlayer={createPlayerForResults}
          />

          <section className="flex flex-col gap-2 rounded border border-gray-300 p-3 text-sm">
            <div className="font-medium">
              {counts.rounds} round(s), {counts.pools} pool(s), {counts.teams} team(s), {counts.players} player slot(s)
            </div>
            {problems.length === 0 ? (
              <p className="text-green-700">No problems found.</p>
            ) : (
              <ul className="list-disc pl-5 text-red-700">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
