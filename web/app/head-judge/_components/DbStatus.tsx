'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import type { DbStatus as Status, Ping } from '@/lib/db-diagnostics';
import { fetchJson } from '@/lib/fetch-json';
import { useLocale, useT } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { formatDateTime } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/locales';

// Which database the server is using, how healthy each is, and the switch
// between the head judge's local server and Postgres (Neon). A small pill next
// to the Control Panel link; it opens to the details.
type Lite = { mode: 'local' | 'remote'; configured: boolean; syncing: boolean; active: Ping };

const SLOW_MS = 400;

// The README's local server section.
const SETUP_DOCS = 'https://github.com/SmilesAir/FullstackFreestyleTools/blob/master/README.MD#running-a-local-server-at-an-event';

const dotOf = (ping: Ping | null | undefined) =>
  !ping || !ping.ok ? 'bg-red-500' : ping.ms !== null && ping.ms > SLOW_MS ? 'bg-amber-500' : 'bg-green-500';

const pingText = (t: Dictionary, ping: Ping | null | undefined) => (ping?.ok ? `${ping.ms} ms` : t.db.noAnswer);

function ago(t: Dictionary, locale: Locale, at: number | null, now: number): string {
  if (at === null) return t.db.never;
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return t.db.justNow;
  if (seconds < 90) return t.db.secondsAgo(seconds);
  if (seconds < 5400) return t.db.minutesAgo(Math.round(seconds / 60));
  return formatDateTime(locale, at);
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
  const t = useT();
  const locale = useLocale();
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
  // The local database's address being typed, and how the last try at it went.
  const [editing, setEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [urlNotice, setUrlNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // Making the database from the Postgres admin login (the password is only ever held
  // here while typing, and is cleared the moment it is sent).
  const [create, setCreate] = useState({
    adminPassword: '',
    database: 'freestyle_local',
    appUser: 'freestyle',
    adminUser: 'postgres',
    host: 'localhost',
    port: '5432',
  });
  const modeRef = useRef<'local' | 'remote'>('remote');
  const box = useRef<HTMLDivElement>(null);

  const read = useCallback(async () => {
    try {
      const url = open ? `/api/db/status?event=${encodeURIComponent(eventId ?? '')}` : '/api/db/status?lite=1';
      // Well under the 15 s between reads from Neon, so a stuck request can't stall the pill.
      const json = await fetchJson<Status & Lite & { mode: 'local' | 'remote' }>(url, 12000);
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
      return { ok: false, message: t.db.noAnswerFromServer } as { ok?: boolean; message?: string; needsConfirm?: boolean };
    } finally {
      setBusy(null);
    }
  };

  const eventChoice = chosen ?? full?.localEventId ?? eventId ?? full?.events[0]?.id ?? '';

  const switchTo = async (target: 'local' | 'remote', force = false) => {
    setConfirm(null);
    const result = await post('/api/db/mode', { target, eventId: eventChoice || undefined, force }, target === 'local' ? t.db.preparingLocal : t.db.sendingChanges);
    if (result.needsConfirm) setConfirm({ text: result.message ?? '', target });
    else setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
    await read();
  };

  const configAction = async (action: 'test' | 'save' | 'clear' | 'setup', label: string) => {
    const result = await post('/api/db/local-config', { action, url: urlDraft.trim() || undefined }, label);
    setUrlNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
    if (result.ok && (action === 'save' || action === 'clear')) {
      setEditing(false);
      setUrlDraft('');
    }
    await read();
  };

  const createDatabase = async () => {
    const body = { action: 'create', ...create };
    setCreate((c) => ({ ...c, adminPassword: '' }));
    const result = await post('/api/db/local-config', body, t.db.creatingDatabase);
    setUrlNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
    if (result.ok) {
      setEditing(false);
      setUrlDraft('');
    }
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
      <span>{mode === 'local' ? t.db.local : t.db.postgres}</span>
      <span className="font-normal tabular-nums text-gray-500">{lite ? pingText(t, pillPing) : '…'}</span>
      {lite?.syncing && <span className="font-normal text-gray-500">{t.db.syncingPill}</span>}
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
          {unreachable && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">{t.db.serverNotAnswering}</p>}

          <section className="flex flex-col gap-2">
            <h2 className={cellTitle}>{t.db.databaseInUse}</h2>
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
                    {target === 'local' ? t.db.localServer : t.db.postgresNeon}
                  </button>
                );
              })}
            </div>
            <a
              href={SETUP_DOCS}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-700 underline"
            >
              {t.db.howToSetUp}
            </a>
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
                    {t.db.switchAnyway}
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="cursor-pointer rounded border border-amber-600 px-2 py-1">
                    {t.db.stay}
                  </button>
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500">{t.db.switchBetweenRoutines}</p>
          </section>

          {!full ? null : full.hosted ? (
            <p className="text-xs text-gray-500">
              {t.db.hostedSite}
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>{t.db.localDatabase}</h2>
              {full?.localUrl && !editing ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs">
                    <div className="break-all font-mono">{full.localUrl}</div>
                    <div className="text-gray-500">
                      {full.localUrlSource === 'settings' ? t.db.setHere : t.db.fromEnv}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy !== null || mode === 'local'}
                    onClick={() => {
                      setUrlNotice(null);
                      setEditing(true);
                    }}
                    className="shrink-0 cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                  >
                    {t.db.change}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    disabled={busy !== null || mode === 'local'}
                    placeholder="postgresql://postgres:password@localhost:5432/freestyle_local"
                    autoComplete="off"
                    spellCheck={false}
                    className="rounded border border-gray-300 bg-background px-2 py-1.5 font-mono text-xs disabled:opacity-50"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || !urlDraft.trim()}
                      onClick={() => void configAction('test', t.db.testing)}
                      className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                    >
                      {t.db.testConnection}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || mode === 'local' || !urlDraft.trim()}
                      onClick={() => void configAction('save', t.db.saving)}
                      className="cursor-pointer rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.db.save}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setEditing(false);
                          setUrlDraft('');
                          setUrlNotice(null);
                        }}
                        className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-white/10"
                      >
                        {t.db.cancel}
                      </button>
                    )}
                    {editing && full?.localUrlSource === 'settings' && (
                      <button
                        type="button"
                        disabled={busy !== null || mode === 'local'}
                        onClick={() => void configAction('clear', t.db.removing)}
                        className="cursor-pointer rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.db.remove}
                      </button>
                    )}
                  </div>
                  <details className="rounded border border-gray-300 px-2 py-1.5">
                    <summary className="cursor-pointer text-xs font-medium">{t.db.createForMe}</summary>
                    <div className="mt-2 flex flex-col gap-2 text-xs">
                      <p className="text-gray-500">
                        {t.db.createHelp}
                      </p>
                      <label className="flex flex-col gap-1">
                        {t.db.adminPassword}
                        <input
                          type="password"
                          value={create.adminPassword}
                          onChange={(e) => setCreate((c) => ({ ...c, adminPassword: e.target.value }))}
                          disabled={busy !== null || mode === 'local'}
                          autoComplete="off"
                          className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          {t.db.databaseName}
                          <input
                            value={create.database}
                            onChange={(e) => setCreate((c) => ({ ...c, database: e.target.value }))}
                            disabled={busy !== null || mode === 'local'}
                            autoComplete="off"
                            spellCheck={false}
                            className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          {t.db.appLoginName}
                          <input
                            value={create.appUser}
                            onChange={(e) => setCreate((c) => ({ ...c, appUser: e.target.value }))}
                            disabled={busy !== null || mode === 'local'}
                            autoComplete="off"
                            spellCheck={false}
                            className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                          />
                        </label>
                      </div>
                      <details>
                        <summary className="cursor-pointer text-gray-500">{t.db.advanced}</summary>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <label className="flex flex-col gap-1">
                            {t.db.adminUser}
                            <input
                              value={create.adminUser}
                              onChange={(e) => setCreate((c) => ({ ...c, adminUser: e.target.value }))}
                              disabled={busy !== null}
                              autoComplete="off"
                              spellCheck={false}
                              className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            {t.db.host}
                            <input
                              value={create.host}
                              onChange={(e) => setCreate((c) => ({ ...c, host: e.target.value }))}
                              disabled={busy !== null}
                              autoComplete="off"
                              spellCheck={false}
                              className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            {t.db.port}
                            <input
                              value={create.port}
                              onChange={(e) => setCreate((c) => ({ ...c, port: e.target.value }))}
                              disabled={busy !== null}
                              inputMode="numeric"
                              autoComplete="off"
                              className="rounded border border-gray-300 bg-background px-2 py-1.5 text-xs disabled:opacity-50"
                            />
                          </label>
                        </div>
                      </details>
                      <button
                        type="button"
                        disabled={busy !== null || mode === 'local' || !create.adminPassword}
                        onClick={() => void createDatabase()}
                        className="cursor-pointer self-start rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.db.createDatabase}
                      </button>
                    </div>
                  </details>
                </div>
              )}
              {full?.localUrl && !editing && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void configAction('test', t.db.testing)}
                    className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                  >
                    {t.db.testConnection}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null || mode === 'local'}
                    onClick={() => void configAction('setup', t.db.settingUpTables)}
                    className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                  >
                    {t.db.setUpTables}
                  </button>
                </div>
              )}
              {!full?.localUrl && !editing && lite && (
                <p className="text-xs text-gray-500">{t.db.noLocalDatabase}</p>
              )}
              {urlNotice && <p className={`text-xs ${urlNotice.ok ? 'text-green-700' : 'text-red-700'}`}>{urlNotice.text}</p>}
              {mode === 'local' && <p className="text-xs text-gray-500">{t.db.switchToChange}</p>}
            </section>
          )}

          <section className="flex flex-col gap-1">
            <h2 className={cellTitle}>{t.db.ping}</h2>
            {[
              { label: t.db.localServer, ping: full?.local, off: full !== null && !full.configured },
              { label: t.db.postgresNeon, ping: full?.remote, off: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${row.off || !row.ping ? 'bg-gray-400' : dotOf(row.ping)}`} />
                  {row.label}
                </span>
                <span className="tabular-nums text-gray-600" title={row.ping?.error}>
                  {row.off ? t.db.notSetUp : row.ping ? pingText(t, row.ping) : '…'}
                </span>
              </div>
            ))}
          </section>

          {configured && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>{t.db.eventOnLocal}</h2>
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
                  const result = await post('/api/db/sync', { action: 'take-offline', eventId: eventChoice }, t.db.downloadingEvent);
                  setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
                  await read();
                }}
                className="cursor-pointer rounded border border-gray-300 px-2 py-1.5 text-sm font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
              >
                {t.db.takeOffline}
              </button>
              <p className="text-xs text-gray-500">
                {full?.localEventName ? t.db.copiedAgo(full.localEventName, ago(t, locale, full.lastFullAt, now)) : t.db.noEventDownloaded}
                {mode === 'local' && t.db.switchToDownload}
              </p>
            </section>
          )}

          {configured && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>{t.db.syncWithNeon}</h2>
              <p className="text-xs">
                {full?.lastSync ? (
                  <span className={full.lastSync.ok ? 'text-gray-700' : 'text-red-700'}>
                    {full.lastSync.message} <span className="text-gray-500">({ago(t, locale, full.lastSync.at, now)})</span>
                  </span>
                ) : (
                  <span className="text-gray-500">{t.db.notSynced}</span>
                )}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-600">
                  {full?.pending ? t.db.waitingToSend(full.pending) : ''}
                </span>
                <button
                  type="button"
                  disabled={busy !== null || mode !== 'local'}
                  onClick={async () => {
                    const result = await post('/api/db/sync', { action: 'sync' }, t.db.syncing);
                    setNotice({ ok: Boolean(result.ok), text: result.message ?? '' });
                    await read();
                  }}
                  className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                >
                  {t.db.syncNow}
                </button>
              </div>
              {full?.backups[0] && (
                <p className="text-xs text-gray-500" title={full.backups.map((b) => b.file).join('\n')}>
                  {t.db.lastBackup(ago(t, locale, full.backups[0].at, now), full.backups[0].file)}
                </p>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className={cellTitle}>{t.db.judges}</h2>
            <p className="text-xs">
              {full?.judges
                ? t.db.judgesConnected(full.judges.connected, full.judges.total)
                : t.db.noPlayingPool}
            </p>
          </section>

          {configured && firstUrl && (
            <section className="flex flex-col gap-2">
              <h2 className={cellTitle}>{t.db.judgesOpenThis}</h2>
              <div className="flex items-start gap-3">
                <Qr text={firstUrl} />
                <div className="flex min-w-0 flex-col gap-1.5 text-xs">
                  {full?.judgeUrls.map((item) => (
                    <div key={item.url} className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => copy(item.url)}
                        className="cursor-pointer break-all text-left text-xs font-medium text-blue-700 underline"
                        title={t.db.copy}
                      >
                        {item.url}
                      </button>
                      <span className="text-gray-500">
                        {copied === item.url ? t.db.copied : `${item.name}${item.hotspot ? t.db.hotspot : ''}`}
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => copy(full?.hostUrl ?? '')}
                      className="cursor-pointer break-all text-left text-xs text-blue-700 underline"
                      title={t.db.copy}
                    >
                      {full?.hostUrl}
                    </button>
                    <span className="text-gray-500">{copied === full?.hostUrl ? t.db.copied : t.db.byName}</span>
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
