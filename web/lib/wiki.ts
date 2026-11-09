// The Wiki's pages, in the order its menu lists them. Each page's title and one-line
// summary are in the dictionaries (lib/i18n/*/wiki.ts, under `pages.<key>`); its text
// is a component per language in app/wiki/_pages/. The Wiki needs no sign-in, so a head
// judge can read it before they have an account.
export const WIKI_PAGES = [
  { slug: 'head-judge', key: 'headJudge' },
  { slug: 'local-server', key: 'localServer' },
] as const;

export type WikiPageKey = (typeof WIKI_PAGES)[number]['key'];

export function findWikiPage(slug: string) {
  return WIKI_PAGES.find((p) => p.slug === slug) ?? null;
}
