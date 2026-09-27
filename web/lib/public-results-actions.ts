'use server';

import { resolvePoolLink } from './public-results';

// Public: the results page's Division/Round/Pool dropdowns call this to get
// (or create) the link for whichever pool was chosen, then navigate to it.
// Not permission-gated — see the comment on resolvePoolLink.
export async function navigateToPool(divisionId: string, roundNumber: number, letter: string): Promise<{ code: string | null }> {
  return { code: await resolvePoolLink(divisionId, roundNumber, letter) };
}
