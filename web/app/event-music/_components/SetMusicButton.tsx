'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MusicDialog, type MusicSaveActions } from '@/app/activity/_components/MusicDialog';
import { clearEventTeamMusic, setEventTeamMusicFile, setEventTeamMusicLink } from '@/lib/event-music-actions';
import { teamName, type HeadJudgeTeam } from '@/lib/head-judge';
import type { TeamMusicByRound } from '@/lib/team-music-links';

const EVENT_MUSIC_ACTIONS: MusicSaveActions = {
  setFile: setEventTeamMusicFile,
  setLink: setEventTeamMusicLink,
  clear: clearEventTeamMusic,
  uploadAs: 'event-music',
};

// The same as a player's My teams music dialog, for any team and any round
// (finished and locked pools too). A save reads the page's data again, so the
// pool counts, the team's song and the player follow at once.
export function SetMusicButton({
  team,
  divisionId,
  rounds,
  music,
}: {
  team: HeadJudgeTeam;
  divisionId: string;
  // The division's rounds, earliest first.
  rounds: number[];
  // Must keep its identity between renders when unchanged (no `?? {}` inline).
  music: TeamMusicByRound;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  // What the last save returned, until the page's data catches up with it.
  const [shown, setShown] = useState(music);
  const [seen, setSeen] = useState(music);
  if (music !== seen) {
    setSeen(music);
    setShown(music);
  }
  const hasMusic = Object.keys(shown).length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="cursor-pointer rounded border border-gray-300 bg-background px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        ♪ {hasMusic ? 'Change music' : 'Set music'}
      </button>
      <MusicDialog
        dialog={dialog}
        teamId={team.id}
        divisionId={divisionId}
        rounds={rounds}
        openRounds={rounds}
        music={shown}
        onChange={(next) => {
          setShown(next);
          router.refresh();
        }}
        actions={EVENT_MUSIC_ACTIONS}
        subtitle={teamName(team)}
      />
    </>
  );
}
