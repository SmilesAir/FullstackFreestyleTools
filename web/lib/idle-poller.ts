// Calls `poll` every `pollMs` while the page is visible, and stops calling it
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
  pollMs: number;
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
  const onVisible = () => {
    if (doc.visibilityState === 'visible') touched();
  };

  const timer = setInterval(() => {
    if (doc.visibilityState !== 'visible' || paused) return;
    if (Date.now() - lastActivity >= idleMs) {
      paused = true;
      onPausedChange(true);
      return;
    }
    poll();
  }, pollMs);

  TOUCH_EVENTS.forEach((name) => doc.addEventListener(name, touched, { passive: true, capture: true }));
  doc.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(timer);
    TOUCH_EVENTS.forEach((name) => doc.removeEventListener(name, touched, { capture: true }));
    doc.removeEventListener('visibilitychange', onVisible);
  };
}
