'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensurePoolLink, setPoolLocked, setPoolResultsPublished } from '@/lib/head-judge-actions';
import type { HeadJudgePool } from '@/lib/head-judge';

// Every pool's public permalink, its Lock/Unlock toggle and its Publish/Unpublish
// toggle, shown at the top of both PoolResults and SimpleRankingResults (the same
// two buttons the Pools tab has, for whoever is already looking at this pool's
// results). The link is the same whether or not the pool is published: before, it
// shows the teams and judges; after, the full results with judges never named.
export function PublicLinkControl({ pool }: { pool: HeadJudgePool }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // What happened to the Discord post the last publish made (none when the event has no channel).
  const [discord, setDiscord] = useState<{ text: string; error: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensurePoolLink(pool.divisionId, pool.roundNumber, pool.letter).then((result) => {
      if (cancelled) return;
      if (result.error || !result.code) setLinkError(result.error ?? 'Could not get a link');
      else setCode(result.code);
    });
    return () => {
      cancelled = true;
    };
  }, [pool.divisionId, pool.roundNumber, pool.letter]);

  const url = code && typeof window !== 'undefined' ? `${window.location.origin}/r/${code}` : null;

  async function toggleLock() {
    setLocking(true);
    setLockError(null);
    const result = await setPoolLocked(pool.divisionId, pool.roundNumber, pool.letter, !pool.locked);
    setLocking(false);
    if (result.error) setLockError(result.error);
    else router.refresh();
  }

  async function togglePublish() {
    setPublishing(true);
    setPublishError(null);
    setDiscord(null);
    const result = await setPoolResultsPublished(pool.divisionId, pool.roundNumber, pool.letter, !pool.resultsPublished);
    setPublishing(false);
    if (result.error) return setPublishError(result.error);
    if (result.discord?.status === 'posted') setDiscord({ text: 'Posted to Discord', error: false });
    else if (result.discord?.status === 'failed') setDiscord({ text: `Not posted to Discord: ${result.discord.error}`, error: true });
    router.refresh();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the link is still shown to copy by hand.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <button
        type="button"
        onClick={toggleLock}
        disabled={locking}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
      >
        {locking ? 'Saving…' : pool.locked ? 'Unlock' : 'Lock'}
      </button>
      <span className={pool.locked ? 'text-gray-700' : 'text-gray-500'}>{pool.locked ? '🔒 Locked' : 'Not locked'}</span>
      {lockError && <span className="text-xs text-red-600">{lockError}</span>}
      <span className="mx-1 text-gray-300">·</span>
      <button
        type="button"
        onClick={togglePublish}
        disabled={publishing}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
      >
        {publishing ? 'Saving…' : pool.resultsPublished ? 'Unpublish' : 'Publish results'}
      </button>
      <span className={pool.resultsPublished ? 'text-green-700' : 'text-gray-500'}>
        {pool.resultsPublished ? '📢 Published' : 'Not published'}
      </span>
      {publishError && <span className="text-xs text-red-600">{publishError}</span>}
      {discord && <span className={`text-xs ${discord.error ? 'text-red-600' : 'text-green-700'}`}>{discord.text}</span>}
      <span className="mx-1 text-gray-300">·</span>
      {linkError ? (
        <span className="text-xs text-red-600">{linkError}</span>
      ) : url ? (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            {url}
          </a>
          <button type="button" onClick={copy} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100">
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </>
      ) : (
        <span className="text-xs text-gray-500">Getting link…</span>
      )}
    </div>
  );
}
