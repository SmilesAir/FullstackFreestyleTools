'use client';

import { useEffect, useRef, useState } from 'react';
import type { JudgeResult } from '@/lib/head-judge-results';
import type { ScoreVersion } from '@/lib/score-history';
import { fetchJson } from '@/lib/fetch-json';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatTime } from '@/lib/i18n/format';

// A judge's submitted score in a results table and, when the judge saved it
// more than once (changed it later), an "edited ×N" mark that opens every
// version of it. Only the Head Judge's results carry `history`, so the public
// results show the plain score.
export function ScoreWithHistory({
  row,
  playerId,
  judgeName,
  category,
}: {
  row: JudgeResult | undefined;
  playerId: string;
  judgeName: string;
  category: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const submitted = row?.submitted;
  if (!submitted) return <span className="font-normal text-gray-400">—</span>;
  const history = row.history;
  if (!history || history.judgeSaves <= 1) return <>{submitted.score}</>;
  return (
    <>
      {submitted.score}{' '}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t.results.scoreEditedTip}
        className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
      >
        {t.results.scoreEdited(history.judgeSaves)}
      </button>
      <HistoryDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.results.scoreHistoryTitle(judgeName)}
        url={`/api/head-judge/score-history?${new URLSearchParams({
          routine: history.routineId,
          judge: playerId,
          category,
        })}`}
      />
    </>
  );
}

function HistoryDialog({ open, onClose, title, url }: { open: boolean; onClose: () => void; title: string; url: string }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] max-w-none rounded-lg border border-gray-300 bg-background p-4 text-left font-normal text-foreground backdrop:bg-black/40"
    >
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {/* Only while open, so it is read fresh each time. */}
      {open && <Versions url={url} />}
      <div className="mt-4 text-right">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1 text-sm">
          {t.common.close}
        </button>
      </div>
    </dialog>
  );
}

function Versions({ url }: { url: string }) {
  const t = useT();
  const locale = useLocale();
  const [versions, setVersions] = useState<ScoreVersion[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    fetchJson<ScoreVersion[]>(url)
      .then((v) => !stopped && setVersions(v))
      .catch(() => !stopped && setFailed(true));
    return () => {
      stopped = true;
    };
  }, [url]);

  if (failed) return <p className="text-sm text-red-600">{t.results.scoreHistoryFailed}</p>;
  if (!versions) return <p className="text-sm text-gray-500">{t.results.scoreHistoryLoading}</p>;
  if (versions.length === 0) return <p className="text-sm text-gray-500">{t.results.scoreHistoryEmpty}</p>;
  return (
    <ol className="space-y-1.5 text-sm tabular-nums">
      {versions.map((v, i) => {
        const previous = versions[i - 1];
        const changed = previous && previous.score !== v.score;
        return (
          <li key={i} className="flex flex-wrap gap-x-2 border-b border-gray-200 pb-1.5 last:border-0">
            <span className="text-gray-500">{formatTime(locale, v.changedAt)}</span>
            <span>
              {t.results.scoreHistorySource[v.source] ?? v.source}
              {v.changedBy && <span className="text-gray-500"> {t.results.scoreHistoryBy(v.changedBy)}</span>}
            </span>
            <span className="ml-auto">
              {changed && <span className="text-gray-500">{previous.score} → </span>}
              <span className="font-semibold">{t.results.scoreHistoryLine(v.score, v.adjustPercent, v.baseline)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
