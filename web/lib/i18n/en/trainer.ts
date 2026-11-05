// The Judging Trainer's bar and results (its Start Guide and Description have a Spanish
// copy of their own: TrainerStartGuideEs.tsx, TrainerDescriptionEs.tsx).
export const trainer = {
  views: {
    guide: 'Start Guide',
    Diff: 'Diff Judge',
    AI: 'AI Judge',
    Ex: 'Ex Judge',
    results: 'Results',
    description: 'FPA2027 Description',
  },
  title: 'Judging Trainer',
  newTestEvent: 'New test event',
  screen: 'Screen',
  endEarlyTip: 'Stop the routine now so the judge can enter the score',
  endEarly: 'End early',
  status: (team: number, judge: string | null, time: string, length: string, over: boolean) =>
    `Team ${team}${judge ? ` · ${judge}` : ''} · ${time} / ${length}${over ? ' · enter the score' : ''}`,
  noRoutine: 'No routine running. Start one from Results.',
  newEventConfirm: 'Start a new test event? Every note and score is cleared.',
  badge: 'Trainer',
  judging: 'Judging…',
  enterScore: 'Enter score',
  runningTip: 'A routine is running. Wait for it, or end it early.',
  start: 'Start',
  resultsHelp: "Press Start under a judge to play that team's routine for that judge, then judge it on their screen.",
};
