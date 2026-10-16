'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRoutineNow, useTimecallCallouts } from '@/app/head-judge/_components/useTimecallCallouts';
import { flattenPools, poolKey, type HeadJudgeDivision } from '@/lib/head-judge';
import { elapsedMs } from '@/lib/head-judge-state';
import type { EventMusicPoll, TeamMusicMap, TeamSongs } from '@/lib/event-music';
import { MusicPoolGrid } from './MusicPoolGrid';
import { MusicPlayer } from './MusicPlayer';
import { PoolTeamList } from './PoolTeamList';
import { RefreshButton } from './RefreshButton';
import { useTimecallEdits } from './TeamTimecalls';
import { useEventMusicPoll } from './useEventMusicPoll';

// Whether this device's time call callouts are muted (on unless it says otherwise).
const MUTED_KEY = 'event-music-muted';

// The chosen event's pools, the chosen pool's teams, and the player pinned to
// the bottom. The player holds the team that is up on the Head Judge's screen,
// unless a team's Play was pressed to test its song; when the Head Judge puts
// another team up, it goes back to the team that's up (without playing). The
// pool shown follows the playing pool, unless another pool was chosen. While
// the team that's up plays its routine, its timer shows in the player and its
// time calls are called out over the music, which is turned down meanwhile.
export function EventMusicShell({
  eventId,
  divisions,
  songs,
  music,
  initialPoll,
}: {
  eventId: string;
  divisions: HeadJudgeDivision[];
  songs: TeamSongs;
  music: TeamMusicMap;
  initialPoll: EventMusicPoll;
}) {
  const { poll, connection, clockOffset } = useEventMusicPoll(eventId, initialPoll);
  const edits = useTimecallEdits();

  const pools = flattenPools(divisions);
  const playingKey =
    poll.divisionId && poll.roundNumber !== null && poll.poolLetter
      ? poolKey(poll.divisionId, poll.roundNumber, poll.poolLetter)
      : null;
  const activeTeamId = poll.teamId;

  const [selectedKey, setSelectedKey] = useState(playingKey);
  const [seenPlayingKey, setSeenPlayingKey] = useState(playingKey);
  if (playingKey !== seenPlayingKey) {
    setSeenPlayingKey(playingKey);
    if (selectedKey === null || selectedKey === seenPlayingKey) setSelectedKey(playingKey);
  }

  // The team being tested, and a count of Play presses so pressing it again restarts the song.
  const [test, setTest] = useState<{ teamId: string; press: number } | null>(null);
  const [seenActiveTeamId, setSeenActiveTeamId] = useState(activeTeamId);
  if (activeTeamId !== seenActiveTeamId) {
    setSeenActiveTeamId(activeTeamId);
    setTest(null);
  }

  const find = (teamId: string | null) => {
    if (!teamId) return null;
    for (const p of pools) {
      const team = p.teams.find((t) => t.id === teamId);
      if (team) return { team, pool: p };
    }
    return null;
  };
  const playerEntry = find(test?.teamId ?? activeTeamId);
  const upEntry = find(activeTeamId);

  // Callouts are on until this device is told otherwise.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        setMuted(localStorage.getItem(MUTED_KEY) === 'true');
      } catch {
        // Storage unavailable: stay on.
      }
    }, 0);
    return () => clearTimeout(read);
  }, []);
  // The player's height, so the room left under the page matches it (a fixed
  // guess was taller than the player and gave short pages a scrollbar).
  // A callback ref, since the player is made afresh for each team (its key).
  const [playerHeight, setPlayerHeight] = useState(0);
  const measurePlayer = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(() => setPlayerHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    try {
      localStorage.setItem(MUTED_KEY, String(next));
    } catch {
      // Not kept across a reload; fine.
    }
  };

  // The routine of the team that's up (whatever is being tested meanwhile).
  const routineStartedAt = upEntry ? poll.routineStartedAt : null;
  const routineSeconds = upEntry?.pool.routineSeconds ?? 0;
  const now = useRoutineNow(routineStartedAt !== null);
  const callouts = useTimecallCallouts({
    routineStartedAt,
    now,
    clockOffset,
    routineSeconds,
    timecalls: upEntry ? edits.timecallsOf(upEntry.team) : [],
    muted,
  });
  const routine =
    routineStartedAt !== null && now !== null
      ? { elapsedMs: elapsedMs(routineStartedAt, now, clockOffset), routineSeconds }
      : null;
  const selectedPool = pools.find((p) => p.key === selectedKey) ?? null;
  // The chosen pool's division's rounds, earliest first (counting down to the
  // Finals = 1; Quarterfinals to Finals when it has fewer).
  const highestRound = Math.max(
    3,
    ...(divisions.find((d) => d.id === selectedPool?.divisionId)?.rounds.map((r) => r.number) ?? [])
  );
  const rounds = Array.from({ length: highestRound }, (_, i) => highestRound - i);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Pools</h2>
          <RefreshButton />
        </div>
        <MusicPoolGrid
          divisions={divisions}
          songs={songs}
          selectedKey={selectedPool?.key ?? null}
          playingKey={playingKey}
          onSelect={setSelectedKey}
        />
      </section>

      {selectedPool ? (
        <PoolTeamList
          pool={selectedPool}
          songs={songs}
          music={music}
          rounds={rounds}
          activeTeamId={activeTeamId}
          testTeamId={test?.teamId ?? null}
          edits={edits}
          onPlay={(teamId) => setTest((current) => ({ teamId, press: (current?.press ?? 0) + 1 }))}
        />
      ) : (
        <p className="text-sm text-gray-500">Choose a pool to see its teams and their songs.</p>
      )}

      {/* Room to scroll the page's end out from under the player. */}
      <div aria-hidden style={{ height: playerHeight }} />

      <MusicPlayer
        ref={measurePlayer}
        key={test ? `test:${test.teamId}:${test.press}` : `up:${activeTeamId}`}
        entry={playerEntry}
        song={playerEntry ? (songs[playerEntry.team.id] ?? null) : null}
        testing={test !== null}
        autoPlay={test !== null}
        connection={connection}
        edits={edits}
        routine={routine}
        muted={muted}
        speechBlocked={callouts.blocked}
        ducked={callouts.speaking}
        onToggleMute={toggleMute}
        onBack={() => setTest(null)}
      />
    </div>
  );
}
