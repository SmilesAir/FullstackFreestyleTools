// Each tool's name and Control Panel description (lib/tools.ts), by tool key.
export const tools = {
  player_editor: {
    label: 'Player Editor',
    description:
      'Search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker.',
  },
  data_bridge: {
    label: 'Data Bridge',
    description: 'Keep events in sync with the live app’s DynamoDB table: per-event toggle, manual run/dry run, and conflict resolution.',
  },
  event_creator: {
    label: 'Event Creator',
    description:
      'Create events, set up divisions/rounds/pools, paste in teams (parsed by Claude), and seed rounds from rankings.',
  },
  event_editor: {
    label: 'Event Editor',
    description:
      "Browse every event on a scrolling monthly calendar, see each one's divisions/rounds/pools/teams, mark events test or hidden, and jump into Results Parser, Event Creator, or Head Judge for one.",
  },
  head_judge: {
    label: 'Head Judge',
    description: 'Run an event day: see every pool with its teams and judges, choose the playing pool, and follow results.',
  },
  event_music: {
    label: 'Event Music',
    description:
      "Play each team's song at an event: pools with how many songs are missing, every team's song to test, a player that always has the team that's up, and their time calls.",
  },
  pool_review: {
    label: 'Pool Review',
    description:
      "Check the pools before they're played: every unpublished pool's teams in play order and its judges. A division's directors see it without being given this tool, and an event's committee sees all its divisions.",
  },
  rankings_generator: {
    label: 'Rankings Generator',
    description:
      'Choose events, tune the ranking and rating settings, preview the rankings and ratings, and publish them for the public results pages.',
  },
  results_parser: {
    label: 'Results Parser',
    description:
      'Enter the results of events run outside this system: paste them for Claude to fill in, check the rounds, pools, places and players, then save.',
  },
  event_registration: {
    label: 'Event Registration',
    description:
      "Build an event's sign-up form (custom questions, each mandatory or optional), get the code to embed it on the tournament's website, see everyone who registered, and mark who has paid.",
  },
  permissions: {
    label: 'Permissions Editor',
    description: 'Create user accounts, toggle admin access, and manage permission groups.',
  },
  settings: {
    label: 'Settings',
    description: 'Configure app-wide settings, including the Discord bot token.',
  },
  backups: {
    label: 'Backups',
    description: 'Create, download, upload, and restore full database backups.',
  },
  public_api: {
    label: 'Public API',
    description: 'Every public read-only endpoint with what it returns, plus its rate limit settings.',
  },
  profile: {
    label: 'Profile',
    description: 'View your account details and choose your language.',
  },
  activity: {
    label: 'Player Activity',
    description:
      'Every pool you played in or judged, newest first: results once a pool has played, the play order (and judges, when you judge) before.',
  },
  judging_trainer: {
    label: 'Judging Trainer',
    description:
      'Practice Fpa2027 judging on a test pool of 8 teams: play every judge and the head judge, then see how the scores and places are worked out. Everything stays in your browser.',
  },
};
