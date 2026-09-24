'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addTeamToRound,
  clearRound,
  removeTeamFromRound,
  seedRoundFromRankings,
  setPoolJudges,
  setRoundConfig,
  setRoundLayout,
} from '@/lib/event-creator-actions';
import {
  JUDGE_CATEGORIES,
  POOL_LETTERS,
  poolId,
  type PoolJudge,
  type PoolJudgeView,
  type RoundConfig,
  type RulesId,
} from '@/lib/event-creator';
import {
  buildLayout,
  insertPoolTeam,
  layoutIds,
  movePoolTeam,
  populatedPoolCount,
  teamKey,
  visiblePoolCount,
  type Layout,
} from '@/lib/event-creator-layout';
import type { TeamRow } from '@/lib/event-creator-queries';
import { Collapsible } from '../Collapsible';
import { PlayerPicker } from '../PlayerPicker';
import { useDivisionUi } from './DivisionWorkspace';

export function RoundSection({
  divisionId,
  roundNumber,
  roundName,
  rulesId,
  config,
  teams,
  judges,
  rosterCount,
}: {
  divisionId: string;
  roundNumber: number;
  roundName: string;
  rulesId: RulesId;
  config: RoundConfig;
  teams: TeamRow[];
  // Pool letter -> the judges assigned to that pool of this round.
  judges: Record<string, PoolJudgeView[]>;
  rosterCount: number;
}) {
  const router = useRouter();
  // Imported rounds can have more pools than the configured count; show every
  // pool that has teams, and don't let the count drop below one.
  const minPoolCount = populatedPoolCount(teams);
  const [poolCount, setPoolCount] = useState(visiblePoolCount(config.poolCount, teams));
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  // A dropped arrangement is shown straight away and stays until the server's
  // data (`teams`) is refreshed, at which point the loaded data takes over.
  const loaded = useMemo(() => buildLayout(teams, poolCount), [teams, poolCount]);
  const [optimistic, setOptimistic] = useState<{ forTeams: TeamRow[]; forCount: number; layout: Layout<TeamRow> } | null>(
    null
  );
  const layout = optimistic && optimistic.forTeams === teams && optimistic.forCount === poolCount ? optimistic.layout : loaded;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ letter: string; index: number } | null>(null);

  // A team from the team list can be dropped in unless it's already in this round.
  const ui = useDivisionUi();
  const inRoundKeys = useMemo(
    () => new Set(Object.values(layout).flatMap((list) => list.map((t) => teamKey(t.players.map((p) => p.id))))),
    [layout]
  );
  const rosterDrag = ui.rosterDrag && !inRoundKeys.has(teamKey(ui.rosterDrag.players.map((p) => p.id))) ? ui.rosterDrag : null;
  const canDrop = draggingId !== null || rosterDrag !== null;
  const { registerRound } = ui;
  const trackRef = useCallback((el: HTMLElement | null) => registerRound(roundNumber, el), [registerRound, roundNumber]);

  const categories = JUDGE_CATEGORIES[rulesId];
  const isFinals = roundNumber === 1;

  function run(fn: () => Promise<{ error: string | null }>, ok?: (r: never) => string) {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.error ? { text: result.error, error: true } : ok ? { text: ok(result as never), error: false } : null);
      if (!result.error) router.refresh();
    });
  }

  function saveConfig() {
    run(() => setRoundConfig(divisionId, roundNumber, poolCount));
  }

  function seed() {
    if (teams.length > 0 && !confirm(`Re-seed ${roundName}? This replaces the teams currently in this round.`)) return;
    startTransition(async () => {
      // Make sure the pool count on screen is what gets used.
      const saved = await setRoundConfig(divisionId, roundNumber, poolCount);
      if (saved.error) return setMessage({ text: saved.error, error: true });
      const result = await seedRoundFromRankings(divisionId, roundNumber);
      setMessage(
        result.error
          ? { text: result.error, error: true }
          : { text: `Seeded ${result.seeded} team(s)${result.byes ? `; ${result.byes} top seed(s) have byes` : ''}.`, error: false }
      );
      if (!result.error) router.refresh();
    });
  }

  function saveJudges(letter: string, judges: PoolJudge[]) {
    run(() => setPoolJudges(divisionId, roundNumber, letter, judges));
  }

  function endDrag() {
    setDraggingId(null);
    setDropTarget(null);
  }

  // Which gap of the pool the pointer is over: the number of rows above it.
  function gapAt(container: HTMLElement, clientY: number): number {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-team-row]'));
    return rows.filter((row) => {
      const box = row.getBoundingClientRect();
      return clientY > box.top + box.height / 2;
    }).length;
  }

  function drop(letter: string, index: number) {
    if (draggingId) {
      const next = movePoolTeam(layout, draggingId, letter, index);
      endDrag();
      if (next === layout) return;

      setOptimistic({ forTeams: teams, forCount: poolCount, layout: next });
      startTransition(async () => {
        const result = await setRoundLayout(divisionId, roundNumber, layoutIds(next));
        setMessage(result.error ? { text: result.error, error: true } : null);
        // On an error the refresh also puts the saved arrangement back.
        router.refresh();
      });
      return;
    }

    if (!rosterDrag) return;
    const added = rosterDrag;
    endDrag();
    ui.setRosterDrag(null);

    // The new row doesn't exist yet, so the team list entry's id stands in for
    // it until the server answers (and the refresh brings the real row).
    const next = insertPoolTeam(layout, { ...added, round_number: roundNumber, pool_id: poolId(letter), place: null, play_order: null }, letter, index);
    setOptimistic({ forTeams: teams, forCount: poolCount, layout: next });
    startTransition(async () => {
      const result = await addTeamToRound(divisionId, roundNumber, added.id, layoutIds(next));
      setMessage(result.error ? { text: result.error, error: true } : null);
      router.refresh();
    });
  }

  function removeTeam(teamId: string, poolLetter: string) {
    if (!confirm(`Remove this team from Pool ${poolLetter}? It stays on the Teams list.`)) return;
    run(() => removeTeamFromRound(divisionId, roundNumber, teamId));
  }

  const roundIsEmpty = teams.length === 0;
  const poolsWithTeams = POOL_LETTERS.slice(0, poolCount).map((letter) => ({ letter, teams: layout[letter] ?? [] }));

  return (
    <Collapsible title={roundName} variant="card" defaultOpen={teams.length > 0} sectionRef={trackRef}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Pools
          <select
            value={poolCount}
            disabled={isFinals}
            onChange={(e) => setPoolCount(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 disabled:opacity-60"
          >
            {POOL_LETTERS.map((_, i) => (
              <option key={i} value={i + 1} disabled={i + 1 < minPoolCount}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={saveConfig} disabled={pending} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50">
          Save
        </button>
        <button
          type="button"
          onClick={seed}
          disabled={pending || rosterCount === 0}
          className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
        >
          Seed from rankings
        </button>
        {teams.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => confirm(`Clear all teams from ${roundName}?`) && run(() => clearRound(divisionId, roundNumber))}
            className="text-xs text-red-600 underline"
          >
            clear round
          </button>
        )}
      </div>
      {rosterCount === 0 && <p className="text-xs text-gray-500">Add teams before seeding.</p>}
      {message && <p className={`text-sm ${message.error ? 'text-red-600' : 'text-green-700'}`}>{message.text}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {poolsWithTeams.map(({ letter, teams: poolTeams }) => (
          <div
            key={letter}
            onDragOver={(e) => {
              // Accepts this round's own teams, and team list teams that aren't in it yet.
              if (!canDrop) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy';
              const index = gapAt(e.currentTarget, e.clientY);
              if (dropTarget?.letter !== letter || dropTarget.index !== index) setDropTarget({ letter, index });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(letter, gapAt(e.currentTarget, e.clientY));
            }}
            className={`flex min-h-24 flex-col gap-2 rounded bg-gray-50 p-2 ${
              dropTarget?.letter === letter ? 'ring-2 ring-blue-400' : ''
            }`}
          >
            <div className="text-sm font-medium">
              Pool {letter} <span className="text-xs font-normal text-gray-500">({poolTeams.length} teams)</span>
            </div>
            <ol className="flex flex-col text-[18.2px]">
              {poolTeams.map((t, i) => (
                <li
                  key={t.id}
                  data-team-row
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', t.id);
                    setDraggingId(t.id);
                  }}
                  onDragEnd={endDrag}
                  // Reserved transparent borders carry the drop indicator without shifting rows.
                  className={`flex cursor-move items-center justify-between gap-2 rounded border-y-2 border-transparent px-1 py-0.5 hover:bg-gray-100 ${
                    draggingId === t.id ? 'opacity-40' : ''
                  } ${dropTarget?.letter === letter && dropTarget.index === i ? 'border-t-blue-500' : ''} ${
                    dropTarget?.letter === letter && dropTarget.index === poolTeams.length && i === poolTeams.length - 1
                      ? 'border-b-blue-500'
                      : ''
                  }`}
                >
                  <span>
                    <span className="mr-2 text-[15.6px] text-gray-400">{i + 1}.</span>
                    {t.players.map((p) => p.name).join(' / ')}
                    <span className="ml-2 text-[15.6px] text-gray-500">{Math.round(t.points)}</span>
                  </span>
                  {t.place === null ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeTeam(t.id, letter)}
                      className="cursor-pointer text-[15.6px] text-red-600 underline disabled:opacity-50"
                    >
                      remove
                    </button>
                  ) : (
                    <span title="This team has a result, so it can't be removed" className="text-[15.6px] text-gray-400">
                      place {t.place}
                    </span>
                  )}
                </li>
              ))}
              {poolTeams.length === 0 && (
                <li className="text-[15.6px] text-gray-400">{roundIsEmpty ? 'Not seeded' : 'Drop a team here'}</li>
              )}
            </ol>

            {categories.length > 0 && (
              <PoolJudges
                judges={judges[letter] ?? []}
                categories={categories}
                disabled={pending}
                onChange={(next) => saveJudges(letter, next)}
              />
            )}
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function PoolJudges({
  judges,
  categories,
  disabled,
  onChange,
}: {
  judges: PoolJudgeView[];
  categories: readonly string[];
  disabled: boolean;
  onChange: (next: PoolJudge[]) => void;
}) {
  const [category, setCategory] = useState(categories[0]);
  // The list saved in the DB, without the names the page needs for display.
  const saved: PoolJudge[] = judges.map((j) => ({ playerId: j.playerId, categoryType: j.categoryType }));

  return (
    <div className="flex flex-col gap-1 border-t border-gray-200 pt-2 text-xs">
      <div className="font-medium text-gray-600">Judges</div>
      {judges.map((j) => (
        <div key={j.playerId} className="flex items-center gap-2">
          <span>
            {j.name} <span className="text-gray-500">({j.categoryType})</span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(saved.filter((x) => x.playerId !== j.playerId))}
            className="text-red-600 underline"
          >
            remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-gray-300 px-1 py-1">
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <div className="flex-1">
          <PlayerPicker
            placeholder="Add judge…"
            onPick={(p) => onChange([...saved.filter((x) => x.playerId !== p.id), { playerId: p.id, categoryType: category }])}
          />
        </div>
      </div>
    </div>
  );
}
