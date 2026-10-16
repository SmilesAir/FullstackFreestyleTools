'use client';

import { useRef } from 'react';
import { MusicEmbed } from '@/app/_components/MusicEmbed';
import { formatElapsed } from '@/lib/head-judge-state';
import { poolTitle, teamName, type HeadJudgePool, type HeadJudgeTeam } from '@/lib/head-judge';
import { songLabel } from '@/lib/event-music';
import { musicFileSrc, parseMusicLink, type TeamMusic } from '@/lib/team-music-links';
import { TeamTimecalls, type TimecallEdits } from './TeamTimecalls';
import { useMusicDuck, youtubeEmbedSrc } from './useMusicDuck';

// Pinned to the bottom of the screen: the song of the team that is up on the
// Head Judge's screen, or of a team being tested (with the way back). It only
// starts by itself when a team's Play button was pressed (`autoPlay`). The
// running routine's timer shows beside it, and the song is turned down while
// a time call is spoken (`ducked`).
export function MusicPlayer({
  entry,
  song,
  testing,
  autoPlay,
  connection,
  edits,
  routine,
  muted,
  speechBlocked,
  ducked,
  onToggleMute,
  onBack,
  ref,
}: {
  entry: { team: HeadJudgeTeam; pool: HeadJudgePool } | null;
  song: TeamMusic | null;
  testing: boolean;
  autoPlay: boolean;
  connection: 'ok' | 'lost';
  edits: TimecallEdits;
  // The routine of the team that's up, while it runs (null = none running).
  routine: { elapsedMs: number; routineSeconds: number } | null;
  // Whether this device's time call callouts are muted.
  muted: boolean;
  // The browser refused to speak until someone clicks the page.
  speechBlocked: boolean;
  ducked: boolean;
  onToggleMute: () => void;
  // The player's box, measured by the page to keep its end clear of it.
  ref?: React.Ref<HTMLDivElement>;
  onBack: () => void;
}) {
  const link = song && !song.fileUrl && song.link ? parseMusicLink(song.link) : null;
  const audio = useRef<HTMLAudioElement>(null);
  const youtube = useRef<HTMLIFrameElement>(null);
  const youtubeSrc = link?.kind === 'youtube' ? youtubeEmbedSrc(link.embedUrl, autoPlay) : null;
  useMusicDuck(ducked, audio, youtube, youtubeSrc);

  return (
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-300 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${testing ? 'text-blue-700' : 'text-green-700'}`}
            >
              {testing ? 'Testing' : 'Up now'}
            </span>
            {testing && (
              <button type="button" onClick={onBack} className="cursor-pointer text-2xl text-blue-600 underline">
                Back to the team that&apos;s up
              </button>
            )}
            {connection === 'lost' && (
              <span className="text-xs font-medium text-red-700">Connection lost: retrying…</span>
            )}
          </div>
          {entry ? (
            <>
              <div className="truncate text-lg font-semibold">{teamName(entry.team)}</div>
              <div className="truncate text-sm text-gray-500">
                {poolTitle(entry.pool)} ·{' '}
                <span className={song ? '' : 'font-medium text-amber-700'}>{song ? songLabel(song) : 'No song for this team'}</span>
              </div>
              <TeamTimecalls
                key={entry.team.id}
                team={entry.team}
                pool={entry.pool}
                edits={edits}
                muted={muted}
                onToggleMute={onToggleMute}
              />
              {speechBlocked && !muted && (
                <p className="text-xs font-medium text-amber-700">
                  The browser blocked a time call: click anywhere on this page to let them play.
                </p>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-500">No team is up on the Head Judge&apos;s screen.</div>
          )}
        </div>

        {routine && (
          <div className="text-right">
            <div className="font-mono text-4xl font-bold tabular-nums">
              {formatElapsed(routine.elapsedMs)}
              <span className="text-xl font-normal text-gray-500"> / {formatElapsed(routine.routineSeconds * 1000)}</span>
            </div>
            <div className="text-xs text-gray-500">Routine time since first throw</div>
          </div>
        )}

        {song && (
          <div className="flex w-full flex-col gap-1 sm:w-[28rem]">
            {song.fileUrl ? (
              <audio
                ref={audio}
                key={song.fileUrl}
                controls
                autoPlay={autoPlay}
                preload="auto"
                src={musicFileSrc(song.fileUrl)}
                className="w-full"
              />
            ) : link ? (
              <>
                <MusicEmbed
                  ref={link.kind === 'youtube' ? youtube : undefined}
                  key={link.embedUrl}
                  embedUrl={youtubeSrc ?? link.embedUrl}
                  kind={link.kind}
                  className={link.kind === 'youtube' ? 'h-48 w-full' : 'h-20 w-full'}
                />
                {link.kind === 'spotify' && (
                  // The embed can't see the Spotify sign-in of another tab when the browser
                  // blocks third-party cookies, so it plays a 30-second preview: the full
                  // song plays in the Spotify app or on open.spotify.com.
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>Only a 30-second preview here?</span>
                    <a href={`spotify:track:${link.id}`} className="font-semibold text-blue-600 underline">
                      Open in the Spotify app
                    </a>
                    <a
                      href={link.link}
                      target="spotify"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-600 underline"
                    >
                      Open on Spotify web
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-red-700">This song&apos;s link can&apos;t be played here.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
