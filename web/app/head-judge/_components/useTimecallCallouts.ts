'use client';

import { useEffect, useRef, useState } from 'react';
import { timecallSpeech } from '@/lib/head-judge';
import { elapsedMs } from '@/lib/head-judge-state';

// How long before its time a time call starts being spoken.
const CALLOUT_LEAD_SECONDS = 1;
// A callout the browser never reports as finished stops counting as spoken after this.
const SPEECH_TIMEOUT_MS = 8000;

// This device's clock (ms), redrawn four times a second while a routine is
// running; null until the first tick. The time itself comes from the start
// time, so it is right whenever it's drawn.
export function useRoutineNow(running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);
  return now;
}

// Calls out each time call as the time left passes it. Only passings seen
// between two ticks count, so opening the screen mid-routine doesn't call out
// the ones already gone. `speaking` is true from when a callout is asked for
// until the last one is done (the music is turned down meanwhile); `blocked`
// is true when the browser refused to speak because nobody has clicked the
// page yet.
export function useTimecallCallouts({
  routineStartedAt,
  now,
  clockOffset,
  routineSeconds,
  timecalls,
  muted,
}: {
  routineStartedAt: number | null;
  now: number | null;
  clockOffset: number;
  routineSeconds: number;
  timecalls: number[];
  muted: boolean;
}): { speaking: boolean; blocked: boolean } {
  const [speaking, setSpeaking] = useState(0);
  const [blocked, setBlocked] = useState(false);
  // Kept so the browser doesn't drop an utterance (and its end event) mid-sentence.
  const pending = useRef(new Set<SpeechSynthesisUtterance>());

  const lastTick = useRef<{ startedAt: number; remaining: number } | null>(null);
  useEffect(() => {
    if (routineStartedAt === null || now === null) {
      lastTick.current = null;
      return;
    }
    const remaining = routineSeconds - elapsedMs(routineStartedAt, now, clockOffset) / 1000;
    const prev = lastTick.current?.startedAt === routineStartedAt ? lastTick.current.remaining : null;
    lastTick.current = { startedAt: routineStartedAt, remaining };
    if (prev === null || muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // A second early, so the words land on the time rather than after it.
    for (const t of [...timecalls].sort((a, b) => b - a)) {
      const at = t + CALLOUT_LEAD_SECONDS;
      if (!(prev > at && at >= remaining)) continue;
      const utterance = new SpeechSynthesisUtterance(timecallSpeech(t));
      pending.current.add(utterance);
      setSpeaking((n) => n + 1);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        pending.current.delete(utterance);
        setSpeaking((n) => Math.max(0, n - 1));
      };
      const timeout = setTimeout(finish, SPEECH_TIMEOUT_MS);
      utterance.onstart = () => setBlocked(false);
      utterance.onend = finish;
      utterance.onerror = (e) => {
        if (e.error === 'not-allowed') setBlocked(true);
        finish();
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [now, routineStartedAt, clockOffset, routineSeconds, timecalls, muted]);

  return { speaking: speaking > 0, blocked };
}
