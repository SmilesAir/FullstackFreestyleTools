// The Event Creator (/events).
export const events = {
  eventSummary: (start: string, end: string) => `${start} → ${end} · event settings below; pick a division tab above to edit it`,
  committee: (n: number) => `Committee (${n})`,
  addWithClaude: 'Add teams to several divisions with Claude',
  addFromRegistration: 'Add players and teams from registration',
  players: (n: number) => `Players (${n})`,
  noPlayers: 'No players yet — add teams in a division tab.',
  pts: (n: number) => `${n} pts`,
  hidden: 'Hidden',
  newDivisionTab: '+ New division',

  // New event / division
  newEvent: 'New event',
  eventNamePlaceholder: 'Event name (e.g. FPAW 2026)',
  start: 'Start',
  end: 'End',
  creating: 'Creating…',
  createEvent: 'Create event',
  newDivision: 'New division',
  divisionType: 'Division type',
  startsWith: (minutes: number) =>
    `Starts with a ${minutes}-minute routine. Only types this event doesn't have yet are listed.`,
  createDivision: 'Create division',
  failedToCreateDivision: 'Failed to create division',

  // Playing toggle
  playing: 'Playing',
  judgesListed: 'Judges are listed on the landing page',
  judgesNotListed: 'Judges are not listed on the landing page',

  // Committee
  committeeHelp: "The people who review this event's pools and results.",
  noCommittee: 'No committee members yet.',
  addCommittee: 'Add a committee member…',
  searchPlayers: 'Search players…',

  // Discord
  channelSaved: 'Channel saved.',
  channelRemoved: 'Channel removed.',
  testPosted: 'Posted to the event thread.',
  inServer: (server: string) => ` in ${server}`,
  discordHelp:
    "The bot keeps one thread for this event in the channel and posts each round's play order (the button on a round) and each pool's results (when the Head Judge publishes them), as an image with the pool's public link.",
  channel: 'Channel:',
  threadCreated: '· thread created',
  sendTestPost: 'Send test post',
  stopPostingConfirm: 'Stop posting this event to Discord?',
  remove: 'remove',
  noChannel: 'No channel set: nothing is posted to Discord.',
  channelPlaceholder: 'Channel link or id (right-click the channel → Copy Link)',
  changeChannel: 'Change channel',
  saveChannel: 'Save channel',
  botHelp:
    "The bot (Settings → Discord) must be in the server with View Channel, Send Messages, Create Public Threads, Send Messages in Threads and Attach Files in this channel, and Mention @everyone, @here and All Roles for results to ping @here. Text, announcement and forum channels all work. A play order tags each pool's players and judges who have linked their Discord account on their profile.",

  // Pasting teams
  pasteHelp:
    "Paste the teams for one or more divisions, for example a spreadsheet with a heading row per division (Mixed pairs, Women pairs, Open pairs, Open coop) followed by its teams. Claude sorts them into this event's divisions.",
  parsing: 'Parsing with Claude…',
  parse: 'Parse with Claude',
  noneFound: "Claude didn't find teams for any known division in that text.",
  couldntParse: "Couldn't parse these lines:",
  existingDivision: 'existing division',
  newDivisionTag: 'new division',
  teamsFound: 'team(s) —',
  teamsFoundRoster: 'team(s) found —',
  matched: (n: number) => `${n} matched`,
  created: (n: number) => `, ${n} created`,
  adding: 'Adding…',
  addToDivisions: (teams: number, divisions: number) => `Add ${teams} team(s) to ${divisions} division(s)`,
  addTeams: 'Add teams',
  discard: 'Discard',
  skippedNote: 'Teams with any unresolved player are skipped, and teams already in a division are not added twice.',
  skippedNoteRoster: 'Teams with any unresolved player are skipped.',
  addedLine: (division: string, added: number, created: boolean, duplicates: number) =>
    `${division}: ${added} added${created ? ' (new division)' : ''}${duplicates ? `, ${duplicates} already there` : ''}`,
  addedNotice: (lines: string, skipped: number) =>
    `${lines}.${skipped ? ` Skipped ${skipped} team(s) with unresolved players.` : ''}`,
  addedRoster: (added: number, skipped: number) =>
    `Added ${added} team(s)${skipped ? `; skipped ${skipped} with unresolved players` : ''}.`,

  // Teams from registration
  fromRegistrationHelp:
    "Builds the teams from this event's registrations: each registered player with the teammates they named for each division they ticked. Partners who registered and named each other become one team, and teams already in a division are left out, so you can load again as more people register.",
  onlyPaid: 'Only paid registrations',
  teammatesFrom: 'Teammates from',
  loadRegistration: 'Load from registration',
  loadingRegistration: 'Loading…',
  noRegistrationForm: "This event doesn't have a registration form yet.",
  openEventRegistration: 'Open Event Registration',
  noRegistrationTeams: 'No new teams in the registrations.',
  registrationSummary: (registrations: number, already: number) =>
    `${registrations} registration(s)${already ? ` · ${already} team(s) already added` : ''}`,
  withoutTeam: 'Registered without a team:',
  lookingForPartner: 'looking for a partner',

  // Teams review
  badge: { matched: 'Matched', uncertain: 'Needs review', none: 'New player?' },
  team: (n: number) => `Team ${n}`,
  createdBadge: 'Created',
  searchDifferent: 'Search for a different player…',
  createAsNew: (name: string) => `Create “${name}” as new player`,
  failedToCreatePlayer: 'Failed to create player',

  // Division
  divisionMissing: "That division doesn't exist for this event.",
  divisionSettings: 'Division settings',
  addTeamsHeading: 'Add teams',
  rounds: 'Rounds',
  teamsCount: (n: number) => `Teams (${n})`,
  deleteDivisionConfirm: "Delete this division? This can't be undone.",
  routineTime: 'Routine time',
  rules: 'Rules',
  headJudge: 'Head judge',
  searchHeadJudge: 'Search for the head judge…',
  directors: 'Directors',
  addDirector: 'Add a director…',
  saveSettings: 'Save settings',
  saved: 'Saved',

  // Roster
  noTeams: 'No teams yet.',
  viewingRound: (round: string) => `Viewing ${round}: dimmed teams are already in it. Drag a team into a pool to add it.`,
  alreadyIn: (round: string) => `Already in ${round}`,
  removeTeamConfirm: 'Remove this team?',

  // Rounds
  results: 'Results',
  published: '📢 Published',
  reseedConfirm: (round: string) => `Re-seed ${round}? This replaces the teams currently in this round.`,
  seeded: (n: number, byes: number) => `Seeded ${n} team(s)${byes ? `; ${byes} top seed(s) have byes` : ''}.`,
  removeFromPoolConfirm: (letter: string) => `Remove this team from Pool ${letter}? It stays on the Teams list.`,
  pools: 'Pools',
  save: 'Save',
  seedFromRankings: 'Seed from rankings',
  teamsPerPool: 'Teams per pool',
  fillFromResults: 'Fill from results',
  fillFromResultsTip: (round: string) => `Fill the pools with the teams that advance from ${round}, plus any byes.`,
  refillConfirm: (round: string) => `Fill ${round} from results? This replaces the teams currently in this round.`,
  filledFromResults: (n: number, byes: number, cut: number) =>
    `Filled ${n} team(s)${byes ? `, ${byes} with a bye` : ''}; ${cut} team(s) didn't advance.`,
  clearRoundConfirm: (round: string) => `Clear all teams from ${round}?`,
  lockedByHeadJudge: '🔒 Locked by the Head Judge',
  postPlayOrder: 'Post Play Order/Judges to Discord',
  reviewTip: "DM the division's directors and the event's committee a Pool Review link for this round.",
  sendForReviewConfirm: (round: string) =>
    `Send ${round} to the directors and committee for review? They each get a Discord DM with a Pool Review link.`,
  sentForReview: 'Sent for review.',
  sendForReview: 'Send for Review',
  addTeamsFirst: 'Add teams before seeding.',
  poolTeams: (n: number) => `(${n} teams)`,
  hasResult: "This team has a result, so it can't be removed",
  notSeeded: 'Not seeded',
  dropHere: 'Drop a team here',

  // Judges
  judges: 'Judges',
  closeJudgesPanel: 'Close judges panel',
  setJudges: 'Set Judges',
  saving: 'Saving…',
  locked: '🔒 Locked',
  setJudgesTitle: (round: string, pool: string) => `Set Judges: ${round} · ${pool}`,
  judgesHelp: (legend: string) =>
    `Drag a player into a column. Numbers are ${legend}: pools judged this event, then lifetime pools per category.`,
  event: 'event',
  couldNotLoadPlayers: 'Could not load players',
  loadingPlayers: 'Loading players…',
  competingIn: (letter: string) => `Competing in Pool ${letter} this round`,
  inPool: (letter: string) => `in ${letter}`,
  noPlayersMatch: 'No players match.',
  showingTop: (max: number, total: number) => `Showing the top ${max} of ${total}. Search to find others.`,
  minutes: (n: number) => `${n} minutes`,
  deleteDivision: 'delete division',
  clearRound: 'clear round',
  roundLockedTip: 'A pool of this round is locked by the Head Judge.',
  playOrderPosted: 'Play order and judges posted to Discord.',
};
