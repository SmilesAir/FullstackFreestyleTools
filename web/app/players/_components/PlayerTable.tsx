'use client';

import Link from 'next/link';
import type { PlayerWithAliasName } from '@/lib/players';
import { useAliasPicker } from './AliasPickerContext';
import { useT } from '@/lib/i18n/client';

export function PlayerTable({ players }: { players: PlayerWithAliasName[] }) {
  const { highlightedId, setHighlightedId, picking, excludeId, pickPlayer } = useAliasPicker();
  const t = useT();

  if (players.length === 0) {
    return <p className="text-sm text-gray-500">{t.players.noPlayersFound}</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="py-2">{t.players.name}</th>
          <th className="py-2">{t.players.country}</th>
          <th className="py-2">{t.players.gender}</th>
          <th className="py-2">{t.players.fpaNumber}</th>
          <th className="py-2">{t.players.alias}</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr
            key={p.id}
            className={`border-b ${p.hidden ? 'text-gray-400' : ''} ${
              p.id === highlightedId ? 'bg-yellow-100' : ''
            }`}
          >
            <td className="py-2">
              <Link href={`/players/${p.id}`} className="text-blue-600 underline">
                {p.first_name} {p.last_name}
              </Link>
              {p.hidden && (
                <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                  {t.players.hidden}
                </span>
              )}
            </td>
            <td className="py-2">{p.country}</td>
            <td className="py-2">{p.gender}</td>
            <td className="py-2">{p.membership || ''}</td>
            <td className="py-2">
              {p.alias_id && (
                <span
                  onMouseEnter={() => setHighlightedId(p.alias_id)}
                  onMouseLeave={() => setHighlightedId(null)}
                >
                  true
                </span>
              )}
            </td>
            <td className="py-2">
              {picking && p.id !== excludeId && (
                <button
                  type="button"
                  onClick={() => pickPlayer(p.id, `${p.first_name} ${p.last_name}`)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs whitespace-nowrap"
                >
                  {t.players.setAsPrimary}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
