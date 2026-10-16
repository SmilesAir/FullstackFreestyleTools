'use client';

import { useState } from 'react';
import { ensureAnnouncerLink } from '@/lib/head-judge-actions';

// Copies the event's unlisted Announcer link (/a/<code>): the pool on stage,
// who is up and the routine timer, for an announcer without an account. The
// link is shown too, for when the browser blocks the clipboard.
export function AnnouncerLinkButton({ eventId }: { eventId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setState('working');
    setError(null);
    let link = url;
    if (!link) {
      const result = await ensureAnnouncerLink(eventId).catch(() => ({ error: 'Could not get a link', code: undefined }));
      if (result.error || !result.code) {
        setState('idle');
        return setError(result.error ?? 'Could not get a link');
      }
      link = `${window.location.origin}/a/${result.code}`;
      setUrl(link);
    }
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // Clipboard access can be blocked; the link is shown to copy by hand.
      setState('idle');
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        disabled={state === 'working'}
        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50"
      >
        {state === 'copied' ? 'Copied!' : state === 'working' ? 'Getting link…' : 'Copy announcer link'}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          {url}
        </a>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
