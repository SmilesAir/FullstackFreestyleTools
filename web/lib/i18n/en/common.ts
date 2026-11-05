// Words and phrases used all over the site.
export const common = {
  // The language for Intl's date and number formats (lib/i18n/locales.ts INTL_LOCALE).
  intlLocale: 'en-US',
  siteName: 'Fullstack Freestyle Tools',
  siteDescription: 'Freestyle frisbee tournament data tools',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  edit: 'Edit',
  working: 'Working…',
  loading: 'Loading…',
  back: 'Back',
  test: 'Test',
  signOut: 'Sign out',
  logIn: 'Log in',
  controlPanel: 'Control panel',
  backToControlPanel: '← Control panel',
  noPlayers: '(no players)',
  language: 'Language',
  pool: (letter: string) => `Pool ${letter}`,
  pools: (letters: string) => `Pools ${letters}`,
  // Rounds are numbered back from the Finals (lib/event-creator.ts ROUNDS).
  roundName: (n: number): string => ({ 1: 'Finals', 2: 'Semifinals', 3: 'Quarterfinals', 4: 'Preliminaries' })[n] ?? `Round ${n}`,
  allRounds: 'All rounds',
  // 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st
  ordinal: (n: number): string => {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  },
};
