'use client';

import { useState } from 'react';

// The content stays mounted while collapsed (just hidden), so half-typed forms
// and unsaved choices survive closing and reopening a section.
// variant 'section' is a page section with a large heading; 'card' is a
// bordered box with a smaller heading, for items inside a section.
export function Collapsible({
  title,
  variant = 'section',
  defaultOpen = true,
  sectionRef,
  children,
}: {
  title: React.ReactNode;
  variant?: 'section' | 'card';
  defaultOpen?: boolean;
  // For callers that need to know where the section is on screen.
  sectionRef?: React.Ref<HTMLElement>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const card = variant === 'card';
  const Heading = card ? 'h3' : 'h2';

  return (
    <section ref={sectionRef} className={`flex flex-col gap-3 ${card ? 'rounded border border-gray-300 p-3' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 text-left"
      >
        <span aria-hidden className={`inline-block text-sm text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>
        <Heading className={card ? 'font-semibold' : 'text-lg font-semibold'}>{title}</Heading>
      </button>
      <div hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
