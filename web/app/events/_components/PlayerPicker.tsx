'use client';

import { useEffect, useRef, useState } from 'react';
import { searchPlayersForPicker } from '@/lib/players-actions';

export type PickedPlayer = { id: string; name: string };

type Result = { id: string; first_name: string; last_name: string; country: string | null; membership: number | null };

export function PlayerPicker({
  onPick,
  placeholder = 'Search players…',
}: {
  onPick: (player: PickedPlayer) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-gray-300 bg-white shadow">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: r.id, name: `${r.first_name} ${r.last_name}` });
                  setQuery('');
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                {r.first_name} {r.last_name}
                <span className="ml-2 text-xs text-gray-500">
                  {[r.country, r.membership ? `FPA# ${r.membership}` : null].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
