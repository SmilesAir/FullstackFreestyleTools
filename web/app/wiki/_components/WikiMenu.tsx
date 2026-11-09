'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { WIKI_PAGES } from '@/lib/wiki';

// The Wiki's list of pages, beside the page on a computer and above it on a phone.
export function WikiMenu() {
  const t = useT();
  const path = usePathname();
  const item = (href: string, label: string) => {
    const current = path === href;
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={current ? 'page' : undefined}
          className={`block rounded px-2 py-1 ${current ? 'bg-blue-50 font-medium text-blue-900' : 'text-blue-600 hover:underline'}`}
        >
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label={t.tools.wiki.label} className="shrink-0 text-sm md:w-56">
      <ul className="flex flex-col gap-0.5">
        {item('/wiki', t.tools.wiki.label)}
        {WIKI_PAGES.map((p) => item(`/wiki/${p.slug}`, t.wiki.pages[p.key].title))}
      </ul>
    </nav>
  );
}
