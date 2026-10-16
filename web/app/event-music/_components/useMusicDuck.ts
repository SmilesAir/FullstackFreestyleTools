'use client';

import { useEffect, useRef, type RefObject } from 'react';

// How loud the music plays under a time call, against its own volume.
const DUCK_LEVEL = 0.25;
const FADE_MS = 250;

// Adds what the Event Music player needs to a YouTube embed link: its player
// messaging turned on (to turn it down under a time call), and starting by
// itself when asked.
export function youtubeEmbedSrc(embedUrl: string, autoPlay: boolean): string {
  const url = new URL(embedUrl);
  url.searchParams.set('enablejsapi', '1');
  if (autoPlay) url.searchParams.set('autoplay', '1');
  return url.toString();
}

// Turns the playing song down while `ducked`, fading, and back up to the volume
// it was at. Works on an MP3 (`audio`) and a YouTube embed (`youtube`); a
// Spotify embed can't have its volume changed, so it plays on as it is.
// `youtubeSrc` is the YouTube embed's link, so a new one is listened to.
export function useMusicDuck(
  ducked: boolean,
  audio: RefObject<HTMLAudioElement | null>,
  youtube: RefObject<HTMLIFrameElement | null>,
  youtubeSrc: string | null
) {
  // How far down the music is (1 = its own volume), and its own volume when
  // the turning down began.
  const level = useRef(1);
  const audioBase = useRef(1);
  // The YouTube player's volume (0-100) as it last reported it.
  const youtubeVolume = useRef(100);

  // Asks the YouTube player to report its volume as it changes.
  useEffect(() => {
    const frame = youtube.current;
    if (!frame) return;
    const origin = new URL(frame.src).origin;
    const listen = () =>
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), origin);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.contentWindow || typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data) as { info?: { volume?: unknown } };
        // Only the operator's own changes count, not the turning down.
        if (typeof data.info?.volume === 'number' && level.current === 1) youtubeVolume.current = data.info.volume;
      } catch {
        // Not one of the player's messages.
      }
    };
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', listen);
    listen();
    return () => {
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', listen);
    };
  }, [youtube, youtubeSrc]);

  useEffect(() => {
    const el = audio.current;
    if (el && level.current === 1) audioBase.current = el.volume;

    const apply = (value: number) => {
      level.current = value;
      if (audio.current) audio.current.volume = Math.min(1, Math.max(0, audioBase.current * value));
      const frame = youtube.current;
      if (frame?.contentWindow) {
        frame.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [Math.round(youtubeVolume.current * value)],
            id: 1,
            channel: 'widget',
          }),
          new URL(frame.src).origin
        );
      }
    };

    const from = level.current;
    const to = ducked ? DUCK_LEVEL : 1;
    if (from === to) return;
    const start = performance.now();
    let frameId = requestAnimationFrame(function step(t) {
      const done = Math.min(1, (t - start) / FADE_MS);
      apply(from + (to - from) * done);
      if (done < 1) frameId = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frameId);
  }, [ducked, audio, youtube]);
}
