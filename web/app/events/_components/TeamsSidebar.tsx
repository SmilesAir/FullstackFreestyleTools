'use client';

import { useState } from 'react';

// A narrow panel beside the division that stays in view while scrolling. It
// starts collapsed; the content stays mounted while collapsed (just hidden).
export function TeamsSidebar({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    // top-12 clears the sticky tab bar.
    <aside className={`flex flex-col gap-2 lg:sticky lg:top-12 ${open ? 'lg:w-72' : ''} lg:shrink-0`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-2 rounded border border-gray-300 px-3 py-2 text-left text-sm font-semibold hover:bg-gray-50"
      >
        <span aria-hidden className={`inline-block text-gray-500 transition-transform ${open ? 'rotate-90' : '-rotate-90'}`}>
          ▶
        </span>
        {title}
      </button>
      <div hidden={!open} className="max-h-[calc(100vh-7rem)] overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}
