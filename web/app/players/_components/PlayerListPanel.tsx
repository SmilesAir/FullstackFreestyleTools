'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { searchPlayersList } from '@/lib/players-actions';
import type { PlayerWithAliasName } from '@/lib/players';
import { PlayerTable } from './PlayerTable';
import { useAliasPicker } from './AliasPickerContext';

export function PlayerListPanel() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [players, setPlayers] = useState<PlayerWithAliasName[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [pending, startTransition] = useTransition();
  const { refreshKey } = useAliasPicker();

  useEffect(() => {
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const result = await searchPlayersList(q, page);
        setPlayers(result.players);
        setTotal(result.total);
        setPageSize(result.pageSize);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [q, page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Players</h1>
        <Link href="/players/new" className="rounded bg-black px-3 py-2 text-sm text-white">
          New player
        </Link>
      </div>

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
        placeholder="Search by name…"
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2"
      />

      <div className={pending ? 'opacity-50' : undefined}>
        <PlayerTable players={players} />
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="underline disabled:pointer-events-none disabled:text-gray-300"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="underline disabled:pointer-events-none disabled:text-gray-300"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
