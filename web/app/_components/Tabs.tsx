'use client';

import { useEffect, useRef, useState } from 'react';

export type Tab = {
  id: string;
  label: string;
  status?: 'draft' | 'published';
  // URL to reflect in the address bar while this tab is active (deep links / refresh).
  href: string;
  content: React.ReactNode;
  // Stretch this tab's content to the rest of the screen's height. Needs the
  // bar's parent to be a flex column that is at least as tall as the screen.
  fill?: boolean;
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
  trailing,
  large = false,
}: {
  tabs: Tab[];
  initialActive: string;
  active?: string;
  onChange?: (id: string) => void;
  // Shown at the right end of the tab bar.
  trailing?: React.ReactNode;
  // Twice the usual size, for screens used by touch.
  large?: boolean;
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

  // When the parent switches tabs itself, keep the address bar in step. Only
  // when the tab changes: the tabs are new objects on every render, and touching
  // the history each time would cancel a refresh of the page's data in flight.
  const shownHref = useRef<string | null>(null);
  useEffect(() => {
    if (controlledActive === undefined) return;
    const tab = tabs.find((t) => t.id === controlledActive);
    if (tab && shownHref.current !== tab.href) {
      shownHref.current = tab.href;
      window.history.replaceState(null, '', tab.href);
    }
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
            className={`whitespace-nowrap border-b-2 ${large ? 'px-8 py-4 text-[28px] leading-tight' : 'px-4 py-2 text-sm'} ${
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
        {trailing && (
          <div
            className={`ml-auto min-w-0 self-center truncate font-semibold ${large ? 'py-4 pl-8 text-[28px] leading-tight' : 'py-2 pl-4 text-sm'}`}
          >
            {trailing}
          </div>
        )}
      </nav>

      {tabs.map((t) => (
        <div key={t.id} hidden={t.id !== current} className={t.fill ? 'mt-3 flex flex-1 flex-col' : 'mt-6'}>
          {t.content}
        </div>
      ))}
    </>
  );
}
