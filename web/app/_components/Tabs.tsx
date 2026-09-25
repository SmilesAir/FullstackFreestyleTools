'use client';

import { useEffect, useState } from 'react';

export type Tab = {
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
//
// By default the bar keeps track of the active tab itself. A parent that needs
// to switch tabs from elsewhere passes `active` and `onChange` instead.
export function Tabs({
  tabs,
  initialActive,
  active: controlledActive,
  onChange,
}: {
  tabs: Tab[];
  initialActive: string;
  active?: string;
  onChange?: (id: string) => void;
}) {
  const [ownActive, setOwnActive] = useState(initialActive);

  // A real navigation (pick an event, create a division, ...) changes the
  // server's idea of the active tab; follow it.
  const [seenInitial, setSeenInitial] = useState(initialActive);
  if (seenInitial !== initialActive) {
    setSeenInitial(initialActive);
    setOwnActive(initialActive);
  }

  const active = controlledActive ?? ownActive;
  const current = tabs.some((t) => t.id === active) ? active : tabs[0].id;

  // When the parent switches tabs itself, keep the address bar in step.
  useEffect(() => {
    if (controlledActive === undefined) return;
    const tab = tabs.find((t) => t.id === controlledActive);
    if (tab) window.history.replaceState(null, '', tab.href);
  }, [controlledActive, tabs]);

  return (
    <>
      {/* Sticky so the tabs stay reachable while scrolling a long page. */}
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
              setOwnActive(t.id);
              onChange?.(t.id);
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
