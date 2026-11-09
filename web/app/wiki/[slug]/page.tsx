import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getT } from '@/lib/i18n/server';
import type { Locale } from '@/lib/i18n/locales';
import { findWikiPage, type WikiPageKey } from '@/lib/wiki';
import { HeadJudgeGuide } from '../_pages/HeadJudgeGuide';
import { HeadJudgeGuideEs } from '../_pages/HeadJudgeGuideEs';
import { LocalServerGuide } from '../_pages/LocalServerGuide';
import { LocalServerGuideEs } from '../_pages/LocalServerGuideEs';

// Each page in every language. When a page changes, change its other languages too.
const PAGES: Record<WikiPageKey, Record<Locale, () => React.ReactNode>> = {
  headJudge: { en: HeadJudgeGuide, es: HeadJudgeGuideEs },
  localServer: { en: LocalServerGuide, es: LocalServerGuideEs },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = findWikiPage((await params).slug);
  return page ? { title: (await getT()).wiki.pages[page.key].title } : {};
}

export default async function WikiPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = findWikiPage((await params).slug);
  if (!page) notFound();
  const Content = PAGES[page.key][await getLocale()];
  return <Content />;
}
