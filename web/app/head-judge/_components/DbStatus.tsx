'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import type { DbStatus as Status, Ping } from '@/lib/db-diagnostics';

// Which database the server is using, how healthy each is, and the switch
// between the head judge's local server and Postgres (Neon). A small pill next
// to the Control Panel link; it opens to the details.
type Lite = { mode: 'local' | 'remote'; configured: boolean; syncing: boolean; active: Ping };

const SLOW_MS = 400;

const dotOf = (ping: Ping | null | undefined) =>
  !ping || !ping.ok ? 'bg-red-500' : ping.ms !== null && ping.ms > SLOW_MS ? 'bg-amber-500' : 'bg-green-500';

const pingText = (ping: Ping | null | undefined) => (ping?.ok ? `${ping.ms} ms` : 'No answer');

function ago(at: number | null, now: number): string {
  if (at === null) return 'never';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 90) return `${seconds} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return new Date(at).toLocaleString();
}

function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: 'svg', margin: 1, width: 128 })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [text]);
  // The markup is made here from the address; there is nothing from outside in it.
  return <div className="h-[128px] w-[128px] shrink-0 rounded bg-white" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function DbStatus() {
  const eventId = useSearchParams().get('event');
  const [open, setOpen] = useState(false);
  const [lite, setLite] = useState<Lite | null>(null);
  const [full, setFull] = useState<Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; target: 'local' | 'remote' } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const modeRef = useRef<'local' | 'remote'>('remote');
  const box = useRef<HTMLDivElement>(null);

  const read = useCallback(async () => {
    try {
      const url = open ? `/api/db/status?event=${encodeURIComponent(eventId ?? '')}` : '/api/db/status?lite=1';
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const json = await response.json();
      if (open) {
        const status = json as Status;
        setFull(status);
        setLite({
          mode: status.mode,
          configured: status.configured,
          syncing: status.syncing,
          active: (status.mode === 'local' ? status.local : status.remote) ?? { ok: false, ms: null },
        });
      } else {
        setLite(json as Lite);
      }
      modeRef.current = json.mode;
      setUnreachable(false);
      setNow(Date.now());
    } catch {
      setUnreachable(true);
    }
  }, [open, eventId]);

  // Keep reading: every second from the local server (the closed pill is a live ping),
  // less often from Neon; the open details every few seconds.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (document.visibilityState === 'visible') await read();
      if (stopped) return;
      const local = modeRef.current === 'local';
      timer = setTimeout(tick, open ? (local ? 3000 : 5000) : local ? 1000 : 15000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [read, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const post = async (path: string, body: object, label: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: { ok?: boolean; message?: string; needsConfirm?: boolean } = await response.json();
      return json;
    } catch {
      return { ok: false, message: 'No answer from the server.' } as { ok?: boolean; message?: string; needsConfirm?: boolean };
    } finally {
      setBusy(null);
    }
  };

  const eventChoice = chosen ?? full?.localEventId ?? eventId ?? full?.events[0]?.id ?? '';

  const switchTo = async (target: 'local' | 'remote', force = false) => {
    setConfirm(null);
    const result = await post('/api/db/mode', { target, eventId: eventChoice || undefined, force }, target === 'local' ? 'Preparing the local server…' : 'Sending changes…');
    if (result.needsConfirm) setConfirm({ text: result.message ?? '', target });
    else setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
    await read();
  };

  const mode = lite?.mode ?? 'remote';
  const configured = lite?.configured ?? false;
  const pillPing = unreachable ? null : lite?.active;
  const pill = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium hover:bg-gray-50 dark:hover:bg-white/10"
    >
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotOf(pillPing)}`} />
      <span>{mode === 'local' ? 'Local' : 'Postgres'}</span>
      <span className="font-normal tabular-nums text-gray-500">{lite ? pingText(pillPing) : '…'}</span>
      {lite?.syncing && <span className="font-normal text-gray-500">· syncing</span>}
    </button>
  );

  const cellTitle = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
  const firstUrl = full?.judgeUrls[0]?.url ?? null;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(text);
        setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
      },
      () => {}
    );
  };

  // Not positioned itself: the details hang from the header row this sits in
  // (right-aligned), so they stay on screen on a phone.
  return (
    <div ref={box}>
      {pill}
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 flex max-h-[80vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-lg border border-gray-300 bg-background p-4 text-sm leading-normal shadow-lg">
          {unreachable && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">The server isn&apos;t answering.</p>}

          <section className="flex flex-col gap-2">
            <h2 className={cellTitle}>Database in use</h2>
            <div className="grid grid-cols-2 gap-1 rounded border border-gray-300 p-1">
              {(['local', 'remote'] as const).map((target) => {
                const active = mode === target;
                return (
                  <button
                    key={target}
                    type="button"
                    disabled={busy !== null || active || (target === 'local' && !configured)}
                    onClick={() => void switchTo(target)}
                    aria-pressed={active}
                    className={`rounded px-2 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${
                      active ? 'bg-blue-600 text-white' : 'cursor-pointer hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10'
                    }`}
                  >
                    {target === 'local' ? 'Local server' : 'Postgres (Neon)'}
                  </button>
                );
              })}
            </div>
            {!configured && lite && (
              <p className="text-xs text-gray-500">
                This server has no local database. Set LOCAL_DATABASE_URL to use one (see the README).
              </p>
            )}
            {busy && <p className="text-xs text-gray-500">{busy}</p>}
            {notice && <p className={`text-xs ${notice.ok ? 'text-green-700' : 'text-red-700'}`}>{notice.text}</p>}
            {confirm && (
              <div className="flex flex-col gap-2 rounded border border-amber-400 bg-amber-50 p-2 text-xs text-amber-900">
                <p>{confirm.text}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void switchTo(confirm.target, true)}
                    className="cursor-pointer rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
                  >
                    Switch anyway
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="cursor-pointer rounded border border-amber-600 px-2 py-1">
                    Stay
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500">Every screen switches at once: do it between routines.</p>
          </section>

          <section className="flex flex-col gap-1">
            <h2 className={cellTitle}>Ping</h2>
            {[
              { label: 'Local server', ping: full?.local, off: full !== null && !full.configured },
              { label: 'Postgres (Neon)', ping: full?.remote, off: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${row.off || !row.ping ? 'bg-gray-400' : dotOf(row.ping)}`} />
                  {row.label}
                </span>
                <span className="tabular-nums text-gray-600" title={row.ping?.error}>
                  {row.off ? 'Not set up' : row.ping ? pingText(row.ping) : '…'}
                </span>
              </div>
            ))}
          </section>

          {configured && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>Event on the local server</h2>
              <select
                value={eventChoice}
                disabled={busy !== null || mode === 'local'}
                onChange={(e) => setChosen(e.target.value)}
                className="rounded border border-gray-300 bg-background px-2 py-1.5 text-sm disabled:opacity-50"
              >
                {(full?.events ?? []).map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy !== null || mode === 'local' || !eventChoice}
                onClick={async () => {
                  const result = await post('/api/db/sync', { action: 'take-offline', eventId: eventChoice }, 'Downloading the event…');
                  setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
                  await read();
                }}
                className="cursor-pointer rounded border border-gray-300 px-2 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
              >
                Take event offline (download it)
              </button>
              <p className="text-xs text-gray-500">
                {full?.localEventName ? `${full.localEventName}: copied ${ago(full.lastFullAt, now)}.` : 'No event downloaded yet.'}
                {mode === 'local' && ' Switch to Postgres to download it again.'}
              </p>
            </section>
          )}

          {configured && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>Sync with Neon</h2>
              <p className="text-xs">
                {full?.lastSync ? (
                  <span className={full.lastSync.ok ? 'text-gray-700' : 'text-red-700'}>
                    {full.lastSync.message} <span className="text-gray-500">({ago(full.lastSync.at, now)})</span>
                  </span>
                ) : (
                  <span className="text-gray-500">Not synced yet.</span>
                )}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-600">
                  {full?.pending ? `${full.pending} change${full.pending === 1 ? '' : 's'} waiting to send.` : ''}
                </span>
                <button
                  type="button"
                  disabled={busy !== null || mode !== 'local'}
                  onClick={async () => {
                    const result = await post('/api/db/sync', { action: 'sync' }, 'Syncing…');
                    setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
                    await read();
                  }}
                  className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                >
                  Sync now
                </button>
              </div>
              {full?.backups[0] && (
                <p className="text-xs text-gray-500" title={full.backups.map((b) => b.file).join('\n')}>
                  Last local backup {ago(full.backups[0].at, now)}. Restore with npm run local:restore -- {full.backups[0].file}
                </p>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className={cellTitle}>Judges</h2>
            <p className="text-xs">
              {full?.judges
                ? `${full.judges.connected} of ${full.judges.total} judges of the playing pool connected (see the Play tab).`
                : 'No playing pool with judges.'}
            </p>
          </section>

          {configured && firstUrl && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>Judges open this on their phones</h2>
              <div className="flex items-start gap-3">
                <Qr text={firstUrl} />
                <div className="flex min-w-0 flex-col gap-1.5 text-xs">
                  {full?.judgeUrls.map((item) => (
                    <div key={item.url} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => copy(item.url)}
                        className="cursor-pointer break-all text-left text-xs font-medium text-blue-700 underline"
                        title="Copy"
                      >
                        {item.url}
                      </button>
                      <span className="text-gray-500">
                        {copied === item.url ? 'Copied' : `${item.name}${item.hotspot ? ' (hotspot)' : ''}`}
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => copy(full?.hostUrl ?? '')}
                      className="cursor-pointer break-all text-left text-xs text-blue-700 underline"
                      title="Copy"
                    >
                      {full?.hostUrl}
                    </button>
                    <span className="text-gray-500">{copied === full?.hostUrl ? 'Copied' : 'By name, if the address changes'}</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
