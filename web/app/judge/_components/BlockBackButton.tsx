'use client';

import { useEffect } from 'react';

// Keeps the browser's back button (and the phone's back gesture) on the
// judging screen, so a judge can't leave it by accident mid-routine. It adds a
// copy of the current history entry and puts it back each time back is pressed.
// The copy keeps Next's own history state, so its router just stays put.
export function BlockBackButton() {
  useEffect(() => {
    const guard = () => history.pushState(history.state, '', location.href);
    guard();
    // Chrome skips history entries added before the user has touched the page,
    // so add one more on the first tap or key press.
    const onFirstInput = () => {
      window.removeEventListener('pointerdown', onFirstInput);
      window.removeEventListener('keydown', onFirstInput);
      guard();
    };
    window.addEventListener('pointerdown', onFirstInput);
    window.addEventListener('keydown', onFirstInput);
    window.addEventListener('popstate', guard);
    return () => {
      window.removeEventListener('pointerdown', onFirstInput);
      window.removeEventListener('keydown', onFirstInput);
      window.removeEventListener('popstate', guard);
    };
  }, []);
  return null;
}
