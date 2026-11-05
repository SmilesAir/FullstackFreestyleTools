'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { hideVersion, publishPoints, removeVersion } from '@/lib/rankings-generator-actions';
import type { ParamProblem, PointsParams } from '@/lib/points/params';
import type { Version } from '@/lib/points-snapshots';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatDateTime } from '@/lib/i18n/format';

// Today as PointsService wrote dates: year-month-day without zero padding.
export function todayKey(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return `${y}-${m}-${d}`;
}

const button =
  'cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10';

// Publishing the current selection and settings, and the versions already published.
export function PublishedPanel({
  versions,
  today,
  local,
  selection,
  params,
  paramsValid,
}: {
  versions: Version[];
  today: string;
  local: boolean;
  selection: { eventIds: string[]; excludedDivisionIds: string[] };
  params: PointsParams;
  paramsValid: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [date, setDate] = useState(todayKey(today));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; problems?: ParamProblem[] } | null>(null);
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));

  const exists = versions.some((v) => v.date === date.trim());
  const run = async (label: string, action: () => Promise<{ ok: boolean; message: string; problems?: ParamProblem[] }>) => {
    setBusy(label);
    setMessage(null);
    try {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message, problems: result.problems });
      if (result.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: t.rankings.noAnswer });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded border border-gray-300 p-4">
        <h2 className="text-lg font-semibold">{t.rankings.publish}</h2>
        <p className="text-sm text-gray-600">
          {t.rankings.publishHelp(selection.eventIds.length)}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            {t.rankings.date}
            <input value={date} onChange={(e) => setDate(e.target.value)} className="w-36 rounded border border-gray-300 bg-background px-2 py-1.5 text-sm" />
          </label>
          <button
            type="button"
            disabled={busy !== null || local || !paramsValid || selection.eventIds.length === 0}
            onClick={() => {
              if (exists && !window.confirm(t.rankings.replaceConfirm(date.trim()))) return;
              void run(t.rankings.publishing, () => publishPoints({ ...selection, params, date }));
            }}
            className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === t.rankings.publishing ? t.rankings.publishing : exists ? t.rankings.replaceVersion : t.rankings.publish}
          </button>
        </div>
        {local && <p className="text-sm text-amber-700">{t.rankings.localNoPublish}</p>}
        {!paramsValid && <p className="text-sm text-red-700">{t.rankings.invalidSettings}</p>}
        {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.rankings.publishedVersions}</h2>
        {versions.length === 0 && <p className="text-sm text-gray-500">{t.rankings.nothingPublished}</p>}
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <li key={version.date} className="rounded border border-gray-300 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-base font-semibold">{version.date}</span>
                {version.isHidden && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs dark:bg-white/15">{t.rankings.hidden}</span>}
                {version.snapshots < 3 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{t.rankings.incomplete}</span>}
                <span className="text-xs text-gray-500">{t.rankings.publishedAt(formatDateTime(locale, version.createdAt))}</span>
                <span className="ml-auto flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void run('Working…', () => hideVersion(version.date, !version.isHidden))} className={button}>
                    {version.isHidden ? t.rankings.show : t.rankings.hide}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm(t.rankings.deleteConfirm(version.date))) void run(t.rankings.workingShort, () => removeVersion(version.date));
                    }}
                    className={`${button} border-red-300 text-red-700`}
                  >
                    {t.rankings.delete}
                  </button>
                </span>
              </div>
              {version.meta && (
                <details className="mt-2 text-xs text-gray-600">
                  <summary className="cursor-pointer">
                    {t.rankings.versionSummary(version.meta.events, version.meta.divisions, version.meta.from, version.meta.to, version.meta.players)}
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 dark:bg-white/5">{JSON.stringify(version.meta.params, null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded border border-gray-300 p-4 text-sm">
        <h2 className="text-lg font-semibold">{t.rankings.feeding}</h2>
        <p className="text-gray-600">
          {t.rankings.feedingHelp} <code>client/source/endpoints.js</code>):
        </p>
        <ul className="font-mono text-xs">
          {['getManifest', 'downloadPointsData/{key}', 'getAllResults', 'getAllEvents', 'getAllPlayers'].map((name) => (
            <li key={name}>
              {origin}/api/v1/points/{name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
