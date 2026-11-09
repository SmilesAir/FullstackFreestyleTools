import type { ReactNode } from 'react';
import Image from 'next/image';
import type { Locale } from '@/lib/i18n/locales';
import { SHOTS, type ShotName } from './shots';

// The building blocks every Wiki page is written with, so the pages (one per
// language) stay plain text and look the same.

export const link = 'text-blue-600 underline';

export function Page({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-8 text-sm leading-relaxed">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="text-gray-600">{intro}</div>
      </header>
      {children}
    </article>
  );
}

// The page's own table of contents: links to its sections.
export function Contents({ label, items }: { label: string; items: { id: string; title: string }[] }) {
  return (
    <nav aria-label={label} className="rounded border border-gray-200 px-4 py-3">
      <p className="mb-1 font-medium">{label}</p>
      <ol className="list-decimal space-y-0.5 pl-5">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={link}>
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-4">
      <h2 className="border-b border-gray-300 pb-1 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// One thing to do, with how to do it underneath.
export function Step({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="flex flex-col gap-1.5 text-gray-800 dark:text-gray-200">{children}</div>}
    </div>
  );
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}

export function Numbered({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1 pl-5">{children}</ol>;
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  const look =
    tone === 'warn' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900';
  return <div className={`rounded border px-3 py-2 ${look}`}>{children}</div>;
}

// A screenshot of the screen the step is about, in the page's language. Phone screens
// (taken at 2x) and the narrow database panel are shown at about their real size; the
// rest fill the column. The image opens full size in a new tab.
export function Shot({ name, lang, alt }: { name: ShotName; lang: Locale; alt: string }) {
  const [width, height] = SHOTS[lang][name];
  const src = `/images/wiki/${lang}/${name}.png`;
  const maxWidth = name.startsWith('judge-') ? 260 : width < 500 ? 340 : undefined;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block w-fit max-w-full" style={{ maxWidth }}>
      <Image src={src} alt={alt} width={width} height={height} className="h-auto w-full rounded border border-gray-300 shadow-sm" />
    </a>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-900">{children}</code>;
}

// Commands to type, one per line.
export function Commands({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-gray-100">
      {lines.join('\n')}
    </pre>
  );
}

// A two-column table (what / where), scrolling sideways on a phone.
export function Table({ head, rows }: { head: [string, string]; rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1 pr-4 font-semibold">{head[0]}</th>
            <th className="py-1 font-semibold">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-200 align-top">
              <td className="py-1.5 pr-4">{row[0]}</td>
              <td className="py-1.5">{row[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
