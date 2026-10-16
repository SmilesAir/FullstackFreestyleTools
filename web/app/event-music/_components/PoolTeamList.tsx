'use client';

import { poolTitle, teamName, type HeadJudgePool } from '@/lib/head-judge';
import { songLabel, type TeamMusicMap, type TeamSongs } from '@/lib/event-music';
import type { TeamMusicByRound } from '@/lib/team-music-links';
import { SetMusicButton } from './SetMusicButton';
import { TeamTimecalls, type TimecallEdits } from './TeamTimecalls';

const NO_MUSIC: TeamMusicByRound = {};

// A pool's teams in play order, each with its song (Play loads it into the
// player below to test it, Set/Change music edits it) and its time calls.
export function PoolTeamList({
  pool,
  songs,
  music,
  rounds,
  activeTeamId,
  testTeamId,
  edits,
  onPlay,
}: {
  pool: HeadJudgePool;
  songs: TeamSongs;
  music: TeamMusicMap;
  // The division's rounds, earliest first.
  rounds: number[];
  activeTeamId: string | null;
  testTeamId: string | null;
  edits: TimecallEdits;
  onPlay: (teamId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{poolTitle(pool)}</h2>
      {pool.locked && <p className="text-sm text-gray-600">🔒 This pool is locked: its time calls can&apos;t be changed.</p>}
      <ol className="flex flex-col divide-y divide-gray-200 rounded border border-gray-300">
        {pool.teams.map((team, i) => {
          const song = songs[team.id];
          const active = team.id === activeTeamId;
          const testing = team.id === testTeamId;
          return (
            <li
              key={team.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 ${
                active ? 'bg-green-50' : testing ? 'bg-blue-50' : ''
              }`}
            >
              <span className="w-6 text-right text-sm tabular-nums text-gray-500">{i + 1}</span>
              <div className="min-w-48 flex-1">
                <div className="font-medium">
                  {teamName(team)}
                  {active && <span className="ml-2 rounded bg-green-600 px-1.5 text-xs font-semibold text-white">Up</span>}
                </div>
                <div className={`text-sm ${song ? 'text-gray-500' : 'font-medium text-amber-700'}`}>
                  {song ? songLabel(song) : 'No song'}
                </div>
              </div>
              <TeamTimecalls team={team} pool={pool} edits={edits} />
              <button
                type="button"
                onClick={() => onPlay(team.id)}
                disabled={!song}
                className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ▶ Play
              </button>
              <SetMusicButton team={team} divisionId={pool.divisionId} rounds={rounds} music={music[team.id] ?? NO_MUSIC} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
