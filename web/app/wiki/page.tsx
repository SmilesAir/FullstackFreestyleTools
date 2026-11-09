import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { WIKI_PAGES } from '@/lib/wiki';

export default async function WikiHome() {
  const t = await getT();
  return (
    <div className="flex flex-col gap-6 text-sm">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t.tools.wiki.label}</h1>
        <p className="text-gray-600">{t.wiki.intro}</p>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">{t.wiki.pagesHeading}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {WIKI_PAGES.map((p) => (
            <li key={p.slug}>
              <Link href={`/wiki/${p.slug}`} className="block h-full rounded border border-gray-200 p-4 hover:border-blue-400">
                <span className="font-medium text-blue-600">{t.wiki.pages[p.key].title}</span>
                <span className="mt-1 block text-gray-600">{t.wiki.pages[p.key].summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
