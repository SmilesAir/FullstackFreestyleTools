'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ROUNDS } from '@/lib/event-creator';
import type { TeamRow } from '@/lib/event-creator-queries';

type DivisionUi = {
  // The round the user is looking at, judged from the scroll position.
  activeRound: { number: number; name: string } | null;
  // Team keys (see teamKey) already in each round.
  roundKeys: Record<number, Set<string>>;
  // A team from the team list that is currently being dragged.
  rosterDrag: TeamRow | null;
  setRosterDrag: (team: TeamRow | null) => void;
  // Each round's element, so scrolling can tell which one is in view.
  registerRound: (roundNumber: number, el: HTMLElement | null) => void;
};

const Ctx = createContext<DivisionUi | null>(null);

export function useDivisionUi(): DivisionUi {
  const ui = useContext(Ctx);
  if (!ui) throw new Error('useDivisionUi must be used inside DivisionWorkspace');
  return ui;
}

// Shares state between the team list sidebar and the rounds: which round is
// in view, and which team is being dragged from the list into a pool.
export function DivisionWorkspace({
  roundKeys,
  children,
}: {
  roundKeys: Record<number, string[]>;
  children: React.ReactNode;
}) {
  const [activeNumber, setActiveNumber] = useState<number | null>(null);
  const [rosterDrag, setRosterDrag] = useState<TeamRow | null>(null);
  const elements = useRef(new Map<number, HTMLElement>());

  const registerRound = useCallback((roundNumber: number, el: HTMLElement | null) => {
    if (el) elements.current.set(roundNumber, el);
    else elements.current.delete(roundNumber);
  }, []);

  useEffect(() => {
    let frame = 0;
    // The round on screen closest to a line 40% of the way down the window
    // (below the sticky tabs). Rounds that aren't on screen, including every
    // round of a hidden division tab, don't count.
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let best: number | null = null;
      let bestDistance = Infinity;
      for (const [number, el] of elements.current) {
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.bottom <= 0 || box.top >= window.innerHeight) continue;
        const distance = box.top <= line && box.bottom >= line ? 0 : Math.min(Math.abs(box.top - line), Math.abs(box.bottom - line));
        if (distance < bestDistance) {
          best = number;
          bestDistance = distance;
        }
      }
      setActiveNumber((current) => (current === best ? current : best));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Folding or unfolding a section moves things without scrolling.
    document.addEventListener('click', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('click', schedule);
    };
  }, []);

  const keySets = useMemo(
    () => Object.fromEntries(Object.entries(roundKeys).map(([n, keys]) => [Number(n), new Set(keys)])),
    [roundKeys]
  );
  const activeRound = useMemo(() => {
    const round = ROUNDS.find((r) => r.number === activeNumber);
    return round ? { number: round.number, name: round.name } : null;
  }, [activeNumber]);

  const value = useMemo(
    () => ({ activeRound, roundKeys: keySets, rosterDrag, setRosterDrag, registerRound }),
    [activeRound, keySets, rosterDrag, registerRound]
  );

  return (
    <Ctx.Provider value={value}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">{children}</div>
    </Ctx.Provider>
  );
}
