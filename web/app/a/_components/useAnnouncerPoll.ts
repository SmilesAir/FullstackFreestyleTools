'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetch-json';
import { HEAD_JUDGE_POLL_MS, type PollMode } from '@/lib/poll-intervals';
import type { AnnouncerPoll } from '@/lib/announcer';

const samePoll = (a: AnnouncerPoll, b: AnnouncerPoll) =>
  a.divisionId === b.divisionId &&
  a.roundNumber === b.roundNumber &&
  a.poolLetter === b.poolLetter &&
  a.teamId === b.teamId &&
  a.routineStartedAt === b.routineStartedAt &&
  a.mode === b.mode;

// Follows who is up on the Head Judge's screen, as fast as the Head Judge's
// own screen does (the same loop as Event Music's useEventMusicPoll). Never
// pauses while the page sits untouched, only while the tab is hidden. When the
// event's pools or teams change, the page's data is read again. `clockOffset`
// is (server time - this device's time), so the timer agrees with the Head
// Judge's.
export function useAnnouncerPoll(code: string, initial: AnnouncerPoll) {
  const [poll, setPoll] = useState(initial);
  const [connection, setConnection] = useState<'ok' | 'lost'>('ok');
  const [clockOffset, setClockOffset] = useState(() => initial.serverNow - Date.now());
  const router = useRouter();
  const structureKey = useRef(initial.structureKey);
  const modeRef = useRef<PollMode>(initial.mode);

  useEffect(() => {
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout>;

    const read = async () => {
      // A slow answer never has a second request stacked on it.
      if (busy) return;
      busy = true;
      try {
        const sentAt = Date.now();
        const data = await fetchJson<AnnouncerPoll>(`/api/announcer/state?code=${encodeURIComponent(code)}`);
        setConnection('ok');
        // The server read its clock about halfway through the request.
        setClockOffset(data.serverNow - (sentAt + Date.now()) / 2);
        modeRef.current = data.mode ?? 'remote';
        if (data.structureKey !== structureKey.current) {
          structureKey.current = data.structureKey;
          router.refresh();
        }
        setPoll((current) => (samePoll(current, data) ? current : data));
      } catch {
        setConnection('lost');
      } finally {
        busy = false;
      }
    };

    const loop = async () => {
      if (document.visibilityState === 'visible') await read();
      if (!stopped) timer = setTimeout(loop, HEAD_JUDGE_POLL_MS[modeRef.current]);
    };
    timer = setTimeout(loop, HEAD_JUDGE_POLL_MS[modeRef.current]);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, router]);

  return { poll, connection, clockOffset };
}
