'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { upload } from '@vercel/blob/client';
import { clearMyTeamMusic, setMyTeamMusicFile, setMyTeamMusicLink, type MusicActionResult } from '@/lib/player-music-actions';
import {
  ALL_ROUNDS,
  MAX_MUSIC_BYTES,
  musicFileSrc,
  musicRoundName,
  parseMusicLink,
  teamMusicPathPrefix,
  type TeamMusicByRound,
} from '@/lib/team-music-links';

const BUTTON = 'cursor-pointer rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50';
const PLAIN = `${BUTTON} border-gray-300 bg-background hover:bg-gray-50`;
const GREEN = `${BUTTON} border-green-600 bg-green-600 font-semibold text-white hover:bg-green-700`;

// Choosing one of the team's rounds (or All rounds), then an MP3 and/or a
// YouTube or Spotify link for it, each playable here to check it.
export function MusicDialog({
  dialog,
  teamId,
  divisionId,
  rounds,
  openRounds,
  music,
  onChange,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  teamId: string;
  divisionId: string;
  // Earliest first.
  rounds: number[];
  openRounds: number[];
  music: TeamMusicByRound;
  onChange: (music: TeamMusicByRound) => void;
}) {
  const [round, setRound] = useState(ALL_ROUNDS);
  // The chosen file, not uploaded yet, and its local preview address.
  const [pending, setPendingState] = useState<{ file: File; url: string } | null>(null);
  const pendingUrl = useRef<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [linkText, setLinkText] = useState(music[ALL_ROUNDS]?.link ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const own = music[round];
  const fallback = round === ALL_ROUNDS || own ? null : music[ALL_ROUNDS];
  const locked = round !== ALL_ROUNDS && !openRounds.includes(round);
  const parsed = parseMusicLink(linkText);
  const savedLink = own?.link ? parseMusicLink(own.link) : null;

  const setFile = (file: File | null) => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    pendingUrl.current = file ? URL.createObjectURL(file) : null;
    setPendingState(file && pendingUrl.current ? { file, url: pendingUrl.current } : null);
  };
  useEffect(() => () => {
    if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
  }, []);
  const file = pending?.file ?? null;

  const pickRound = (next: number) => {
    setRound(next);
    setFile(null);
    setLinkText(music[next]?.link ?? '');
    setError(null);
  };

  const run = async (action: () => Promise<MusicActionResult>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result.error !== null) return setError(result.error);
      onChange(result.music);
      return true;
    } catch {
      setError('Not saved. Check the connection and try again.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const choose = (picked: File | null) => {
    setError(null);
    if (!picked) return setFile(null);
    if (picked.type !== 'audio/mpeg' && !picked.name.toLowerCase().endsWith('.mp3')) {
      return setError('Choose an MP3 file.');
    }
    if (picked.size > MAX_MUSIC_BYTES) return setError(`The file is over ${MAX_MUSIC_BYTES / 1024 / 1024} MB.`);
    setFile(picked);
  };

  const uploadFile = async () => {
    if (!file) return;
    const saved = await run(async () => {
      setProgress(0);
      const safe = file.name.replace(/\.mp3$/i, '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'music';
      const blob = await upload(`${teamMusicPathPrefix(divisionId)}${safe}.mp3`, file, {
        access: 'private',
        handleUploadUrl: '/api/team-music/upload',
        clientPayload: JSON.stringify({ teamId, round }),
        contentType: 'audio/mpeg',
        onUploadProgress: (p) => setProgress(p.percentage),
      });
      return setMyTeamMusicFile(teamId, round, blob.url, file.name);
    });
    if (saved) setFile(null);
  };

  return (
    <dialog
      ref={dialog}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-gray-300 bg-background p-4 text-foreground backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Music</h3>
            <p className="text-sm text-gray-500">
              All rounds plays in every round, unless a round has its own.
            </p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className={PLAIN}>
            Close
          </button>
        </div>

        <fieldset className="flex flex-wrap gap-1.5" disabled={busy}>
          <legend className="sr-only">Round</legend>
          {[ALL_ROUNDS, ...rounds].map((n) => {
            const isOpen = n === ALL_ROUNDS || openRounds.includes(n);
            return (
              <label
                key={n}
                className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                  round === n ? 'border-green-600 bg-green-50 font-semibold text-green-900' : 'border-gray-300'
                }`}
                title={isOpen ? undefined : 'Finished or locked'}
              >
                <input
                  type="radio"
                  name={`music-round-${teamId}`}
                  checked={round === n}
                  onChange={() => pickRound(n)}
                  disabled={!isOpen}
                  className="accent-green-600"
                />
                {musicRoundName(n)}
                {music[n] && <span className="text-green-600" aria-label="has music">●</span>}
              </label>
            );
          })}
        </fieldset>

        {fallback !== null && (
          <p className="text-sm text-gray-600">
            {fallback
              ? `No music of its own: uses All rounds (${fallback.fileName ?? 'link'}).`
              : 'No music set for this round or All rounds.'}
          </p>
        )}
        {locked && <p className="text-sm text-gray-600">This round is finished or locked.</p>}

        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">MP3 file</h4>
          {own?.fileUrl && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">{own.fileName}</p>
              <audio controls preload="none" src={musicFileSrc(own.fileUrl)} className="w-full" />
            </div>
          )}
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            disabled={busy || locked}
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
            key={`${round}:${own?.fileUrl ?? ''}`}
            className="text-sm file:mr-2 file:cursor-pointer file:rounded file:border file:border-gray-300 file:bg-background file:px-3 file:py-1.5"
          />
          {pending && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">Preview (not uploaded yet)</p>
              <audio controls src={pending.url} className="w-full" />
            </div>
          )}
          {progress !== null && (
            <div className="h-2 overflow-hidden rounded bg-gray-200" role="progressbar" aria-valuenow={Math.round(progress)}>
              <div className="h-full bg-green-600" style={{ width: `${progress}%` }} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={uploadFile} disabled={!file || busy || locked} className={GREEN}>
              {own?.fileUrl ? 'Upload and replace' : 'Upload'}
            </button>
            {own?.fileUrl && (
              <button
                type="button"
                onClick={() => run(() => clearMyTeamMusic(teamId, round, 'file'))}
                disabled={busy || locked}
                className={PLAIN}
              >
                Remove file
              </button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">YouTube or Spotify link</h4>
          <input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or https://open.spotify.com/track/…"
            disabled={busy || locked}
            className="rounded border border-gray-300 bg-background px-3 py-2 text-sm"
          />
          {linkText.trim() && !parsed && <p className="text-xs text-red-700">Not a YouTube video or Spotify track link.</p>}
          {(parsed ?? savedLink) && <MusicEmbed embedUrl={(parsed ?? savedLink)!.embedUrl} kind={(parsed ?? savedLink)!.kind} />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => run(() => setMyTeamMusicLink(teamId, round, linkText))}
              disabled={!parsed || parsed.link === own?.link || busy || locked}
              className={GREEN}
            >
              Save link
            </button>
            {own?.link && (
              <button
                type="button"
                onClick={async () => {
                  if (await run(() => clearMyTeamMusic(teamId, round, 'link'))) setLinkText('');
                }}
                disabled={busy || locked}
                className={PLAIN}
              >
                Remove link
              </button>
            )}
          </div>
        </section>

        {own?.fileUrl && own.link && (
          <p className="text-xs text-gray-500">Both are set: the MP3 file is played.</p>
        )}
        {busy && <p className="text-xs text-gray-400">Saving…</p>}
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      </div>
    </dialog>
  );
}

function MusicEmbed({ embedUrl, kind }: { embedUrl: string; kind: 'youtube' | 'spotify' }) {
  return kind === 'youtube' ? (
    <iframe
      src={embedUrl}
      title="YouTube player"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      className="aspect-video w-full rounded border-0"
    />
  ) : (
    <iframe
      src={embedUrl}
      title="Spotify player"
      allow="autoplay; clipboard-write; encrypted-media"
      className="h-20 w-full rounded-xl border-0"
    />
  );
}
