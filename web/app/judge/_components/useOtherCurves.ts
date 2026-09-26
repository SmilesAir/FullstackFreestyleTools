import { useEffect, useState } from 'react';
import type { NoteCategory, OtherCurve } from '@/lib/judging';

const POLL_MS = 5000;
const NONE: OtherCurve[] = [];

// The other judges' averaged curves for one routine, read from the server while
// `active` (the score dialog is open): straight away, then every few seconds
// (the other judges may still be noting). A failed read keeps what was shown.
export function useOtherCurves(
  eventId: string,
  playerId: string,
  category: NoteCategory,
  routineId: string | null,
  active: boolean
): OtherCurve[] {
  const [curves, setCurves] = useState<{ routineId: string; others: OtherCurve[] } | null>(null);

  useEffect(() => {
    if (!active || routineId === null) return;
    let stopped = false;
    const load = async () => {
      try {
        const query = new URLSearchParams({ event: eventId, player: playerId, category, routine: routineId });
        const response = await fetch(`/api/judge/others?${query}`, { cache: 'no-store' });
        if (!response.ok) return;
        const others: OtherCurve[] = await response.json();
        if (!stopped) setCurves({ routineId, others });
      } catch {
        // Keep what is on screen; the next read tries again.
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, eventId, playerId, category, routineId]);

  return curves && curves.routineId === routineId ? curves.others : NONE;
}
