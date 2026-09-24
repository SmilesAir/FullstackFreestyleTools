'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchPlayersForPicker } from '@/lib/players-actions';
import { linkPlayer, type ActionState } from '@/lib/profile-actions';

type Result = {
  id: string;
  first_name: string;
  last_name: string;
  country: string | null;
  membership: number | null;
  alias_id: string | null;
};

export function PlayerLinkPicker() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>({ error: null });
  const [pending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      const matches = await searchPlayersForPicker(query);
      setResults(matches);
      setOpen(matches.length > 0);
    }, 250);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  function pick(result: Result) {
    setOpen(false);
    const formData = new FormData();
    formData.set('player_id', result.id);
    startTransition(async () => {
      const outcome = await linkPlayer({ error: null }, formData);
      setState(outcome);
      if (!outcome.error) router.refresh();
    });
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for your name…"
        className="w-full rounded border border-gray-300 px-3 py-2"
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-gray-300 bg-white shadow">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r)}
                disabled={pending}
                className="block w-full px-3 py-2 text-left hover:bg-gray-100 disabled:opacity-50"
              >
                <div>
                  {r.first_name} {r.last_name}
                </div>
                <div className="text-xs text-gray-500">
                  {[r.country, r.membership ? `FPA# ${r.membership}` : null].filter(Boolean).join(' · ') || '—'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
