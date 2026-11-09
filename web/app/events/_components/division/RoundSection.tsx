'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addTeamToRound,
  clearRound,
  fillRoundFromResults,
  postRoundPlayOrderToDiscord,
  sendRoundForReviewOnDiscord,
  removeTeamFromRound,
  seedRoundFromRankings,
  setRoundConfig,
  setRoundLayout,
} from '@/lib/event-creator-actions';
import {
  DEFAULT_FINALS_TEAMS,
  JUDGE_CATEGORIES,
  MAX_TEAMS_PER_POOL,
  MIN_TEAMS_PER_POOL,
  POOL_LETTERS,
  poolId,
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
import { useDivisionUi } from './DivisionWorkspace';
import { PoolJudgeColumns } from './PoolJudgeColumns';
import { useT } from '@/lib/i18n/client';

// One shared empty list, so a pool with no judges keeps a stable identity.
const NO_JUDGES: PoolJudgeView[] = [];

// The Head Judge Pools tab's tags (PoolsTab.tsx), plus one for a pool that has results.
function PoolStatusTags({ playing, results, published }: { playing: boolean; results: boolean; published: boolean }) {
  const tr = useT();
  return (
    <>
      {playing && <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">{tr.events.playing}</span>}
      {results && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{tr.events.results}</span>}
      {published && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">{tr.events.published}</span>}
    </>
  );
}

export function RoundSection({
  divisionId,
  roundNumber,
  roundName,
  rulesId,
  config,
  teams,
  judges,
  rosterCount,
  lockedPoolKeys,
  publishedPoolKeys,
  playingPoolKey,
  discordReady,
  previousRoundName,
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
  // Every locked pool of the division, as "round:LETTER" keys.
  lockedPoolKeys: string[];
  // Every pool of the division with its results published, as "round:LETTER" keys.
  publishedPoolKeys: string[];
  // The Head Judge's playing pool, as a "round:LETTER" key, if it's in this division.
  playingPoolKey: string | null;
  // The event has a Discord channel, so the play order can be posted there.
  discordReady: boolean;
  // The round played before this one (the closest earlier round with teams), if any.
  previousRoundName: string | null;
}) {
  const router = useRouter();
  const tr = useT();
  // Imported rounds can have more pools than the configured count; show every
  // pool that has teams, and don't let the count drop below one.
  const minPoolCount = populatedPoolCount(teams);
  const [poolCount, setPoolCount] = useState(visiblePoolCount(config.poolCount, teams));
  // Empty = not chosen (Finals then take DEFAULT_FINALS_TEAMS).
  const [teamsPerPool, setTeamsPerPool] = useState(config.teamsPerPool ? String(config.teamsPerPool) : '');
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

  const teamsPerPoolValue = teamsPerPool.trim() === '' ? null : Number(teamsPerPool);

  function saveConfig() {
    run(() => setRoundConfig(divisionId, roundNumber, poolCount, teamsPerPoolValue));
  }

  function fill() {
    if (teams.length > 0 && !confirm(tr.events.refillConfirm(roundName))) return;
    startTransition(async () => {
      // Make sure the pool count and teams per pool on screen are what get used.
      const saved = await setRoundConfig(divisionId, roundNumber, poolCount, teamsPerPoolValue);
      if (saved.error) return setMessage({ text: saved.error, error: true });
      const result = await fillRoundFromResults(divisionId, roundNumber);
      setMessage(
        result.error
          ? { text: result.error, error: true }
          : { text: tr.events.filledFromResults(result.filled ?? 0, result.byes ?? 0, result.cut ?? 0), error: false }
      );
      if (!result.error) router.refresh();
    });
  }

  function seed() {
    if (teams.length > 0 && !confirm(tr.events.reseedConfirm(roundName))) return;
    startTransition(async () => {
      // Make sure the pool count on screen is what gets used.
      const saved = await setRoundConfig(divisionId, roundNumber, poolCount);
      if (saved.error) return setMessage({ text: saved.error, error: true });
      const result = await seedRoundFromRankings(divisionId, roundNumber);
      setMessage(
        result.error
          ? { text: result.error, error: true }
          : { text: tr.events.seeded(result.seeded ?? 0, result.byes ?? 0), error: false }
      );
      if (!result.error) router.refresh();
    });
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
    const next = insertPoolTeam(layout, { ...added, round_number: roundNumber, pool_id: poolId(letter), place: null, play_order: null, timecalls: null }, letter, index);
    setOptimistic({ forTeams: teams, forCount: poolCount, layout: next });
    startTransition(async () => {
      const result = await addTeamToRound(divisionId, roundNumber, added.id, layoutIds(next));
      setMessage(result.error ? { text: result.error, error: true } : null);
      router.refresh();
    });
  }

  function removeTeam(teamId: string, poolLetter: string) {
    if (!confirm(tr.events.removeFromPoolConfirm(poolLetter))) return;
    run(() => removeTeamFromRound(divisionId, roundNumber, teamId));
  }

  const roundIsEmpty = teams.length === 0;
  const poolsWithTeams = POOL_LETTERS.slice(0, poolCount).map((letter) => ({ letter, teams: layout[letter] ?? [] }));
  // Re-seeding or clearing rewrites every pool of the round at once, so either
  // is refused (here and on the server) while any pool of the round is locked.
  const roundLocked = lockedPoolKeys.some((k) => k.startsWith(`${roundNumber}:`));

  // Each pool's status, tagged like the Head Judge's Pools tab: playing, has a
  // result (any team placed), results published.
  const statusOf = (letter: string, poolTeams: TeamRow[]) => ({
    playing: playingPoolKey === `${roundNumber}:${letter}`,
    results: poolTeams.some((t) => t.place !== null),
    published: publishedPoolKeys.includes(`${roundNumber}:${letter}`),
  });
  const headingPools = poolsWithTeams
    .map(({ letter, teams: poolTeams }) => ({ letter, ...statusOf(letter, poolTeams) }))
    .filter((s) => s.playing || s.results || s.published);
  // With one pool the round's tags are that pool's, so the letter is left off.
  const showLetters = poolsWithTeams.filter((p) => p.teams.length > 0).length > 1;
  const title = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {roundName}
      {headingPools.map((s) => (
        <span key={s.letter} className="flex items-center gap-1">
          {showLetters && <span className="text-xs font-medium text-gray-500">{tr.common.pool(s.letter)}</span>}
          <PoolStatusTags {...s} />
        </span>
      ))}
    </span>
  );

  return (
    <Collapsible title={title} variant="card" defaultOpen={teams.length > 0} sectionRef={trackRef}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          {tr.events.pools}
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
        {previousRoundName && (
          <label className="flex flex-col gap-1">
            {tr.events.teamsPerPool}
            <input
              type="number"
              min={MIN_TEAMS_PER_POOL}
              max={MAX_TEAMS_PER_POOL}
              value={teamsPerPool}
              placeholder={isFinals ? String(DEFAULT_FINALS_TEAMS) : undefined}
              onChange={(e) => setTeamsPerPool(e.target.value)}
              className="w-20 rounded border border-gray-300 px-2 py-1"
            />
          </label>
        )}
        <button type="button" onClick={saveConfig} disabled={pending} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50">
          {tr.events.save}
        </button>
        <button
          type="button"
          onClick={seed}
          disabled={pending || rosterCount === 0 || roundLocked}
          title={roundLocked ? tr.events.roundLockedTip : undefined}
          className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
        >
          {tr.events.seedFromRankings}
        </button>
        {previousRoundName && (
          <button
            type="button"
            onClick={fill}
            disabled={pending || roundLocked}
            title={roundLocked ? tr.events.roundLockedTip : tr.events.fillFromResultsTip(previousRoundName)}
            className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
          >
            {tr.events.fillFromResults}
          </button>
        )}
        {teams.length > 0 && (
          <button
            type="button"
            disabled={pending || roundLocked}
            title={roundLocked ? tr.events.roundLockedTip : undefined}
            onClick={() => confirm(tr.events.clearRoundConfirm(roundName)) && run(() => clearRound(divisionId, roundNumber))}
            className="text-xs text-red-600 underline disabled:opacity-50"
          >
            {tr.events.clearRound}
          </button>
        )}
        {roundLocked && (
          <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">{tr.events.lockedByHeadJudge}</span>
        )}
        {teams.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            {discordReady && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => postRoundPlayOrderToDiscord(divisionId, roundNumber), () => tr.events.playOrderPosted)}
                className="rounded border border-indigo-300 px-3 py-1 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                {tr.events.postPlayOrder}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              title={tr.events.reviewTip}
              onClick={() =>
                confirm(tr.events.sendForReviewConfirm(roundName)) &&
                run(
                  () => sendRoundForReviewOnDiscord(divisionId, roundNumber),
                  (r: { summary?: string }) => r.summary ?? tr.events.sentForReview
                )
              }
              className="rounded border border-indigo-300 px-3 py-1 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {tr.events.sendForReview}
            </button>
          </div>
        )}
      </div>
      {rosterCount === 0 && <p className="text-xs text-gray-500">{tr.events.addTeamsFirst}</p>}
      {message && <p className={`text-sm ${message.error ? 'text-red-600' : 'text-green-700'}`}>{message.text}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {poolsWithTeams.map(({ letter, teams: poolTeams }) => {
          const poolLocked = lockedPoolKeys.includes(`${roundNumber}:${letter}`);
          return (
          <div
            key={letter}
            onDragOver={(e) => {
              // Accepts this round's own teams, and team list teams that aren't in it yet.
              if (!canDrop || poolLocked) return;
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
              if (poolLocked) return;
              drop(letter, gapAt(e.currentTarget, e.clientY));
            }}
            className={`flex min-h-24 flex-col gap-2 rounded bg-gray-50 p-2 ${
              dropTarget?.letter === letter ? 'ring-2 ring-blue-400' : ''
            }`}
          >
            <div className="text-sm font-medium">
              {tr.common.pool(letter)} <span className="text-xs font-normal text-gray-500">{tr.events.poolTeams(poolTeams.length)}</span>
              {poolLocked && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-700">{tr.events.locked}</span>}
              <span className="ml-2 inline-flex gap-1 align-middle">
                <PoolStatusTags {...statusOf(letter, poolTeams)} />
              </span>
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
                      disabled={pending || poolLocked}
                      onClick={() => removeTeam(t.id, letter)}
                      className="cursor-pointer text-[15.6px] text-red-600 underline disabled:opacity-50"
                    >
                      remove
                    </button>
                  ) : (
                    <span title={tr.events.hasResult} className="text-[15.6px] text-gray-400">
                      place {t.place}
                    </span>
                  )}
                </li>
              ))}
              {poolTeams.length === 0 && (
                <li className="text-[15.6px] text-gray-400">{roundIsEmpty ? tr.events.notSeeded : tr.events.dropHere}</li>
              )}
            </ol>

            {categories.length > 0 && (
              <PoolJudgeColumns
                divisionId={divisionId}
                roundNumber={roundNumber}
                roundName={roundName}
                letter={letter}
                categories={categories}
                judges={judges[letter] ?? NO_JUDGES}
                locked={poolLocked}
              />
            )}
          </div>
          );
        })}
      </div>
    </Collapsible>
  );
}
