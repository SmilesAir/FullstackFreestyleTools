'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/fetch-json';
import { startIdlePoller } from '@/lib/idle-poller';
import { JUDGE_POLL_MS, type PollMode } from '@/lib/poll-intervals';
import { submitSimpleRanking } from '@/lib/simple-ranking-actions';
import { isComplete, pressArrow } from '@/lib/simple-ranking';

const IDLE_MS = 10 * 60 * 1000;

// This browser's anonymous judge id: made up once and kept, so re-sending
// replaces this browser's own ballot instead of counting as another judge.
// crypto.randomUUID only exists on secure pages; getRandomValues works on any.
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const h = Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function getJudgeToken(): string {
  try {
    const key = 'simple-ranking-judge-token';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const token = newToken();
    localStorage.setItem(key, token);
    return token;
  } catch {
    // Private window or blocked storage: a token for this load only (re-sending will count as a new judge).
    return newToken();
  }
}

const draftKey = (eventId: string, poolKey: string) => `simple-ranking-draft:${eventId}:${poolKey}`;
function readDraft(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, ranking: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ranking));
  } catch {
    // Nothing kept for a refresh; the next poll still shows the live pool.
  }
}

type Team = { id: string; name: string };
type PollResponse = { pool: { key: string; title: string; teams: Team[] } | null; ranking: string[] | null; mode?: PollMode };

const sameOrder = (a: readonly string[], b: readonly string[] | null) => b !== null && a.length === b.length && a.every((id, i) => id === b[i]);

export function SimpleRankingJudge({ eventId }: { eventId: string }) {
  const [token] = useState(getJudgeToken);
  const [poolKey, setPoolKey] = useState<string | null>(null);
  const [poolTitle, setPoolTitle] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ranking, setRanking] = useState<string[]>([]);
  const [submittedRanking, setSubmittedRanking] = useState<string[] | null>(null);
  const [connected, setConnected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = useRef<PollMode>('remote');

  // The poll compares against these without needing to restart on a change.
  const state = useRef({ poolKey, ranking, submittedRanking });
  useEffect(() => {
    state.current = { poolKey, ranking, submittedRanking };
  });

  const poll = useCallback(async () => {
    try {
      const query = new URLSearchParams({ event: eventId, judge: token });
      const body = await fetchJson<PollResponse>(`/api/judge/simple?${query}`);
      mode.current = body.mode ?? 'remote';
      setConnected(true);

      const current = state.current;
      if (body.pool?.key !== current.poolKey) {
        // A different (or the first) pool: start from the server's ranking if it
        // has one, otherwise this browser's own unsent draft for that pool.
        const nextKey = body.pool?.key ?? null;
        const draft = nextKey ? readDraft(draftKey(eventId, nextKey)) : null;
        setPoolKey(nextKey);
        setPoolTitle(body.pool?.title ?? null);
        setTeams(body.pool?.teams ?? []);
        setRanking(body.ranking ?? draft ?? []);
        setSubmittedRanking(body.ranking ?? null);
        setError(null);
        return;
      }

      // Same pool: a ranking already sent from this browser (or picked up by
      // another poll) is the new baseline. Only follow the server's value into
      // the working ranking while nothing here has changed since that baseline
      // — an edit in progress is never overwritten mid-poll.
      const dirty = !sameOrder(current.ranking, current.submittedRanking) && !(current.submittedRanking === null && current.ranking.length === 0);
      setSubmittedRanking(body.ranking ?? null);
      if (!dirty) setRanking(body.ranking ?? []);
      setTeams(body.pool?.teams ?? []);
    } catch {
      setConnected(false);
    }
  }, [eventId, token]);

  useEffect(() => {
    const first = setTimeout(() => void poll(), 0);
    const stop = startIdlePoller({ poll: () => void poll(), pollMs: () => JUDGE_POLL_MS[mode.current], idleMs: IDLE_MS, onPausedChange: () => {} });
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [poll]);

  // Keep this browser's unsent progress, per pool, so a refresh or a dropped
  // connection loses nothing.
  useEffect(() => {
    if (poolKey) writeDraft(draftKey(eventId, poolKey), ranking);
  }, [eventId, poolKey, ranking]);

  const teamIds = teams.map((t) => t.id);
  const complete = isComplete(ranking, teamIds);
  const dirty = !sameOrder(ranking, submittedRanking);

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await submitSimpleRanking(eventId, token, [...ranking]);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSubmittedRanking([...ranking]);
  }

  if (!poolKey) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-gray-500">
        <p>There is nothing to rank right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-28">
      <div>
        <h1 className="text-lg font-semibold">{poolTitle}</h1>
        <p className="text-sm text-gray-500">
          Rank the teams from best (1) to worst. {ranking.length} of {teams.length} ranked.
        </p>
        {!connected && <p className="mt-1 text-xs text-amber-700">Connection lost. Your ranking is kept and will send once it&apos;s back.</p>}
      </div>

      <ol className="flex flex-col gap-2">
        {teams.map((team, i) => {
          const place = ranking.indexOf(team.id);
          const atTop = place === 0;
          const atBottom = place === ranking.length - 1;
          return (
            <li key={team.id} className="flex items-center gap-3 rounded border border-gray-300 p-3">
              <span className="w-6 shrink-0 text-center text-xs text-gray-400">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words text-base font-medium">{team.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move ${team.name} down`}
                  disabled={place !== -1 && atBottom}
                  onClick={() => setRanking((r) => [...pressArrow(r, team.id, 'down')])}
                  className="flex h-11 w-11 items-center justify-center rounded border border-gray-300 text-xl disabled:opacity-30"
                >
                  ▼
                </button>
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                    place === -1 ? 'bg-gray-100 text-gray-400' : 'bg-black text-white'
                  }`}
                >
                  {place === -1 ? '–' : place + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Move ${team.name} up`}
                  disabled={place !== -1 && atTop}
                  onClick={() => setRanking((r) => [...pressArrow(r, team.id, 'up')])}
                  className="flex h-11 w-11 items-center justify-center rounded border border-gray-300 text-xl disabled:opacity-30"
                >
                  ▲
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-300 bg-background p-3">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {!dirty && submittedRanking !== null ? (
          <p className="text-center text-sm font-medium text-green-700">Sent to the head judge ✓</p>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!complete || saving}
            className="w-full rounded bg-black py-3 text-base font-medium text-white disabled:opacity-40"
          >
            {saving ? 'Sending…' : submittedRanking === null ? 'Submit' : 'Send changes'}
          </button>
        )}
      </div>
    </div>
  );
}
