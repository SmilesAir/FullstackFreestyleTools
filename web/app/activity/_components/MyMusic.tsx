'use client';

import { useRef, useState } from 'react';
import type { MyTeam } from '@/lib/team-timecalls';
import { ALL_ROUNDS, musicRoundName, type TeamMusicByRound } from '@/lib/team-music-links';
import { MusicDialog } from './MusicDialog';

// One of the player's teams' music: a button naming the rounds that have
// some, which opens the dialog to set it.
export function MyMusic({ team }: { team: MyTeam }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [music, setMusic] = useState<TeamMusicByRound>(team.music);

  const setRounds = [ALL_ROUNDS, ...team.rounds].filter((n) => music[n]);
  const label = setRounds.length === 0 ? 'Set music' : setRounds.map(musicRoundName).join(' · ');

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        disabled={!team.editable}
        className="cursor-pointer self-start rounded border border-gray-300 bg-background px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        ♪ {label}
      </button>
      <MusicDialog
        dialog={dialog}
        teamId={team.teamId}
        divisionId={team.divisionId}
        rounds={team.rounds}
        openRounds={team.openRounds}
        music={music}
        onChange={setMusic}
      />
    </>
  );
}
