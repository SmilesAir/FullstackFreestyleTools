'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseRosterText, type ParsedSlot } from '@/lib/roster-parser';
import { addRosterTeams, quickCreatePlayer } from '@/lib/event-creator-actions';
import { PlayerPicker } from '../PlayerPicker';

type Slot = ParsedSlot & { selectedName: string | null; created?: boolean };

const BADGE = {
  matched: 'bg-green-100 text-green-800',
  uncertain: 'bg-amber-100 text-amber-800',
  none: 'bg-red-100 text-red-800',
} as const;
const BADGE_LABEL = { matched: 'Matched', uncertain: 'Needs review', none: 'New player?' } as const;

export function RosterPasteForm({ divisionId }: { divisionId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [teams, setTeams] = useState<Slot[][] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();

  function parse() {
    setError(null);
    setNotice(null);
    startParse(async () => {
      const result = await parseRosterText(text);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setUnparsed(result.unparsed);
      setTeams(
        result.teams.map((team) =>
          team.map((slot) => ({
            ...slot,
            selectedName: slot.selectedId ? (slot.candidates.find((c) => c.id === slot.selectedId)?.name ?? null) : null,
          }))
        )
      );
    });
  }

  function updateSlot(t: number, s: number, patch: Partial<Slot>) {
    setTeams((prev) => prev && prev.map((team, ti) => (ti !== t ? team : team.map((slot, si) => (si !== s ? slot : { ...slot, ...patch })))));
  }

  async function createPlayer(t: number, s: number, name: string) {
    const result = await quickCreatePlayer(name);
    if (result.error || !result.player) {
      setError(result.error ?? 'Failed to create player');
      return;
    }
    setError(null);
    updateSlot(t, s, { selectedId: result.player.id, selectedName: result.player.name, created: true });
  }

  const all = teams?.flat() ?? [];
  const counts = {
    matched: all.filter((s) => s.status === 'matched' && s.selectedId && !s.created).length,
    review: all.filter((s) => s.status === 'uncertain' && !s.selectedId).length,
    unresolved: all.filter((s) => s.status === 'none' && !s.selectedId).length,
    created: all.filter((s) => s.created).length,
  };

  function confirm() {
    if (!teams) return;
    const complete = teams.filter((team) => team.every((s) => s.selectedId));
    const skipped = teams.length - complete.length;
    startSave(async () => {
      const result = await addRosterTeams(
        divisionId,
        complete.map((team) => team.map((s) => s.selectedId as string))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(`Added ${result.added} team(s)${skipped ? `; skipped ${skipped} with unresolved players` : ''}.`);
      setTeams(null);
      setUnparsed([]);
      setText('');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'Paste teams in any format, e.g.\n1. Jane Doe / John Smith\nRiccardo Montanari & Francesco Santolin\nFabian Dinklage, Daniel O\'Neill'}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={parse}
        disabled={parsing || !text.trim()}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {parsing ? 'Parsing with Claude…' : 'Parse with Claude'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {teams && (
        <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
          <p className="text-sm">
            <strong>{teams.length}</strong> team(s) found — <span className="text-green-700">{counts.matched} matched</span>
            {counts.created > 0 && <span className="text-green-700">, {counts.created} created</span>},{' '}
            <span className={counts.review ? 'font-medium text-amber-700' : ''}>{counts.review} need review</span>,{' '}
            <span className={counts.unresolved ? 'font-medium text-red-700' : ''}>{counts.unresolved} new player(s)</span>
          </p>

          {unparsed.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
              <div className="font-medium text-amber-800">Couldn&apos;t parse these lines:</div>
              <ul className="list-disc pl-5 text-amber-900">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {teams.map((team, t) => (
            <div key={t} className="flex flex-col gap-2 rounded bg-gray-50 p-2">
              <div className="text-xs text-gray-500">Team {t + 1}</div>
              {team.map((slot, s) => (
                <div key={s} className="flex flex-col gap-1 border-l-2 border-gray-300 pl-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">&ldquo;{slot.input}&rdquo;</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${slot.created ? BADGE.matched : BADGE[slot.status]}`}>
                      {slot.created ? 'Created' : BADGE_LABEL[slot.status]}
                    </span>
                    {slot.selectedName && <span className="text-gray-700">→ {slot.selectedName}</span>}
                    {slot.selectedId && (
                      <button type="button" onClick={() => updateSlot(t, s, { selectedId: null, selectedName: null, created: false })} className="text-xs text-red-600 underline">
                        clear
                      </button>
                    )}
                  </div>
                  {!slot.selectedId && (
                    <div className="flex flex-col gap-1">
                      {slot.candidates.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {slot.candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => updateSlot(t, s, { selectedId: c.id, selectedName: c.name })}
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100"
                            >
                              {c.name}
                              <span className="ml-1 text-gray-500">
                                {[c.country, c.membership ? `FPA# ${c.membership}` : null].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="w-64">
                          <PlayerPicker
                            onPick={(p) => updateSlot(t, s, { selectedId: p.id, selectedName: p.name })}
                            placeholder="Search for a different player…"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => createPlayer(t, s, slot.input)}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          Create &ldquo;{slot.input}&rdquo; as new player
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={saving || teams.length === 0}
              className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add teams'}
            </button>
            <button type="button" onClick={() => setTeams(null)} className="rounded border border-gray-300 px-3 py-2 text-sm">
              Discard
            </button>
          </div>
          <p className="text-xs text-gray-500">Teams with any unresolved player are skipped.</p>
        </div>
      )}
    </div>
  );
}
