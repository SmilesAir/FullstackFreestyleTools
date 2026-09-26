// Calls `poll` every `pollMs` (a number, or a function giving the interval to
// wait next, so it can change while running) while the page is visible, and stops calling it
// after `idleMs` without the user touching the page. Any touch (or coming back
// to a hidden tab) starts it again with an immediate poll. Reading only:
// nothing here affects saving.

export type PollerDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;

const TOUCH_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

export function startIdlePoller({
  poll,
  pollMs,
  idleMs,
  onPausedChange,
  doc = document,
}: {
  poll: () => void;
  pollMs: number | (() => number);
  idleMs: number;
  onPausedChange: (paused: boolean) => void;
  doc?: PollerDocument;
}): () => void {
  let lastActivity = Date.now();
  let paused = false;

  const touched = () => {
    lastActivity = Date.now();
    if (paused) {
      paused = false;
      onPausedChange(false);
      poll();
    }
  };
  // Coming back to the page (a phone's screen waking, another tab closed): ask at
  // once rather than at the next tick, which a sleeping phone may have delayed.
  const onVisible = () => {
    if (doc.visibilityState !== 'visible') return;
    const wasPaused = paused;
    touched();
    if (!wasPaused) poll();
  };

  const tick = () => {
    if (doc.visibilityState === 'visible' && !paused) {
      if (Date.now() - lastActivity >= idleMs) {
        paused = true;
        onPausedChange(true);
      } else {
        poll();
      }
    }
    timer = setTimeout(tick, typeof pollMs === 'number' ? pollMs : pollMs());
  };
  let timer = setTimeout(tick, typeof pollMs === 'number' ? pollMs : pollMs());

  TOUCH_EVENTS.forEach((name) => doc.addEventListener(name, touched, { passive: true, capture: true }));
  doc.addEventListener('visibilitychange', onVisible);

  return () => {
    clearTimeout(timer);
    TOUCH_EVENTS.forEach((name) => doc.removeEventListener(name, touched, { capture: true }));
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
