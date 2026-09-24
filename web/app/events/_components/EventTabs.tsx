'use client';

import { useEffect, useState } from 'react';

export type EventTab = {
  id: string;
  label: string;
  status?: 'draft' | 'published';
  // URL to reflect in the address bar while this tab is active (deep links / refresh).
  href: string;
  content: React.ReactNode;
};

// Every tab's content is rendered by the server up front and kept mounted
// (hidden when inactive), so switching tabs is instant: no server round trip,
// and things like half-typed pasted text survive a tab switch.
export function EventTabs({ tabs, initialActive }: { tabs: EventTab[]; initialActive: string }) {
  const [active, setActive] = useState(initialActive);

  // A real navigation (pick an event, create a division, ...) changes the
  // server's idea of the active tab; follow it.
  useEffect(() => setActive(initialActive), [initialActive]);

  const current = tabs.some((t) => t.id === active) ? active : tabs[0].id;

  return (
    <>
      {/* Sticky so the tabs stay reachable while scrolling a long division. */}
      <nav className="sticky top-0 z-20 flex overflow-x-auto border-b border-gray-300 bg-background" role="tablist">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={t.id === current}
            onClick={(e) => {
              // Let ctrl/cmd/middle-click open the link normally.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              setActive(t.id);
              window.history.replaceState(null, '', t.href);
            }}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${
              t.id === current ? 'border-black font-semibold text-black' : 'border-transparent text-gray-600 hover:text-black'
            }`}
          >
            {t.label}
            {t.status && (
              <span
                title={t.status === 'draft' ? 'Draft' : 'Published'}
                className={`ml-2 inline-block h-2 w-2 rounded-full ${t.status === 'draft' ? 'bg-amber-400' : 'bg-green-500'}`}
              />
            )}
          </a>
        ))}
      </nav>

      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== current} className="mt-6">
          {t.content}
        </div>
      ))}
    </>
  );
}
