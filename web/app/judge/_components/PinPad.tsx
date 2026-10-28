'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { enterJudgePin } from '@/lib/judge-pin-actions';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

// The event's judge PIN, typed on big on-screen keys (no text box, so the
// phone's keyboard never opens; a real keyboard's digits work too). Sent as soon
// as the second digit is in. Shown on a judge page before the screen itself, or
// over a running screen (`onUnlocked`) when the Head Judge has made a new PIN.
export function PinPad({
  eventId,
  judgeName,
  categoryLabel,
  onUnlocked,
}: {
  eventId: string;
  judgeName?: string;
  categoryLabel?: string;
  // Called once the PIN is accepted; without it the page is loaded again.
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const [digits, setDigits] = useState('');
  const [remember, setRemember] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Too many wrong PINs: no more tries until then (this device's clock).
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const locked = lockedUntil !== null && lockedUntil > now;
  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) setLockedUntil(null);
    }, 250);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const check = useCallback(
    async (pin: string) => {
      setChecking(true);
      setError(null);
      const result = await enterJudgePin(eventId, pin, remember).catch(() => ({
        ok: false as const,
        error: 'Could not check the PIN. Check the connection and try again.',
        retryAfterMs: undefined,
      }));
      setChecking(false);
      setDigits('');
      if (result.ok) {
        if (onUnlocked) onUnlocked();
        else router.refresh();
        return;
      }
      setError(result.error);
      if (result.retryAfterMs) {
        setNow(Date.now());
        setLockedUntil(Date.now() + result.retryAfterMs);
      }
    },
    [eventId, remember, onUnlocked, router]
  );

  const press = useCallback(
    (key: string) => {
      if (checking || locked) return;
      if (key === 'back') return setDigits((d) => d.slice(0, -1));
      if (!/^\d$/.test(key) || digits.length >= 2) return;
      const next = digits + key;
      setDigits(next);
      if (next.length === 2) void check(next);
    },
    [checking, locked, digits, check]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') press('back');
      else if (/^\d$/.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const waitSeconds = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;
  const wait = `${Math.floor(waitSeconds / 60)}:${String(waitSeconds % 60).padStart(2, '0')}`;

  const pad = (
    <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-5 px-4 py-8">
      <div className="text-center">
        {judgeName && <p className="text-lg font-semibold">{judgeName}</p>}
        {categoryLabel && <p className="text-sm text-gray-500">{categoryLabel}</p>}
        <p className="mt-3 text-sm text-gray-700">Enter the judge PIN from the head judge.</p>
      </div>

      <div className="flex gap-3" aria-label={`${digits.length} of 2 digits entered`}>
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`flex h-16 w-14 items-center justify-center rounded border-2 text-3xl font-bold ${
              i === digits.length && !checking && !locked ? 'border-black' : 'border-gray-300'
            }`}
          >
            {digits[i] ? '•' : ''}
          </span>
        ))}
      </div>

      <p className="min-h-5 text-center text-sm" role="status">
        {locked ? (
          <span className="text-red-700">Too many tries. Try again in {wait}.</span>
        ) : checking ? (
          <span className="text-gray-500">Checking…</span>
        ) : error ? (
          <span className="text-red-700">{error}</span>
        ) : null}
      </p>

      <div className="grid w-full grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={checking || locked || (key === 'back' && digits.length === 0)}
              aria-label={key === 'back' ? 'Delete' : key}
              className="flex h-16 items-center justify-center rounded border border-gray-300 text-2xl font-semibold active:bg-gray-200 disabled:opacity-30"
            >
              {key === 'back' ? '⌫' : key}
            </button>
          )
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4" />
        Remember this device
      </label>
    </div>
  );

  // Over a running screen: covers it until the PIN is in.
  if (onUnlocked) return <div className="fixed inset-0 z-50 overflow-y-auto bg-background">{pad}</div>;
  return pad;
}
