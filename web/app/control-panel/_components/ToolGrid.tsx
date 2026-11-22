'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import type { ToolKey } from '@/lib/tools';
import { setToolStarred } from '../actions';

// Lowercase, accents stripped, so "musica" finds "Música del evento".
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function ToolGrid({
  tools,
  noLinkedPlayer,
  starred: initialStarred,
}: {
  tools: { key: ToolKey; href: string }[];
  noLinkedPlayer: boolean;
  starred: string[];
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [starred, setStarred] = useState(() => new Set(initialStarred));

  function flip(key: ToolKey, on: boolean) {
    setStarred((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // Shown at once; put back if the account couldn't be updated.
  async function toggle(key: ToolKey) {
    const on = !starred.has(key);
    flip(key, on);
    const res = await setToolStarred(key, on).catch(() => ({ ok: false }));
    if (!res.ok) flip(key, !on);
  }

  // Every word typed must appear in the tool's name or description.
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matching = tools.filter((tool) => {
    const text = fold(`${t.tools[tool.key].label} ${t.tools[tool.key].description}`);
    return words.every((w) => text.includes(w));
  });
  // Starred first, each group in its usual order.
  const shown = [...matching.filter((x) => starred.has(x.key)), ...matching.filter((x) => !starred.has(x.key))];

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.home.filterTools}
        aria-label={t.home.filterTools}
        className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm sm:max-w-sm"
      />

      {shown.length === 0 && <p className="text-sm text-gray-500">{t.home.noToolsMatch}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((tool) => {
          const isStarred = starred.has(tool.key);
          const label = isStarred ? t.home.unstarTool : t.home.starTool;
          return (
            <div key={tool.href} className="relative">
              <Link href={tool.href} className="block h-full rounded border border-gray-300 p-4 pr-10 hover:bg-gray-50">
                <div className="font-medium text-blue-600">{t.tools[tool.key].label}</div>
                <p className="mt-1 text-sm text-gray-600">{t.tools[tool.key].description}</p>
                {tool.href === '/profile' && noLinkedPlayer && (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {t.home.noLinkedPlayerWarning}
                  </p>
                )}
              </Link>
              <button
                type="button"
                onClick={() => toggle(tool.key)}
                aria-pressed={isStarred}
                aria-label={label}
                title={label}
                className={`absolute right-2 top-2 cursor-pointer rounded px-1.5 text-xl leading-none hover:bg-gray-100 ${
                  isStarred ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'
                }`}
              >
                {isStarred ? '★' : '☆'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
