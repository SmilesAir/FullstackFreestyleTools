// Shared (client + server) shapes for the Head Judge's live play state.

// Times are milliseconds since the epoch on the *server's* clock.
export type PlayState = {
  divisionId: string | null;
  roundNumber: number | null;
  poolLetter: string | null;
  teamId: string | null;
  // When the first throw was clicked; null = no routine running.
  routineStartedAt: number | null;
  // Judges (player ids) who have submitted their score for the running routine.
  finishedJudges: string[];
  // When no routine is running: the playing team's latest routine in this pool,
  // if it was cancelled with judges' notes or scores on it (so it can be
  // restored). Otherwise null.
  restorableRoutineId: string | null;
  updatedAt: number;
};

// The state plus the server's clock when it was read, so a screen can work out
// how far its own clock is from the server's, and a fingerprint of the event's
// structure (its divisions, pools, teams and judges: see getStructureKey). When
// the fingerprint differs from the one the page was drawn with, the page is out
// of date and reloads its data. Empty when there is no event.
// `presence` is the seconds since each judge's screen (player id) last polled the
// server, and `mode` says which database answered ('local' = the head judge's
// laptop, whose screens poll faster). Like the fingerprint, neither is part of
// PlayState.
export type PlayResponse = {
  state: PlayState;
  serverNow: number;
  structureKey: string;
  presence: Record<string, number>;
  mode: 'local' | 'remote';
};

export const NO_PLAY_STATE: PlayState = {
  divisionId: null,
  roundNumber: null,
  poolLetter: null,
  teamId: null,
  routineStartedAt: null,
  finishedJudges: [],
  restorableRoutineId: null,
  updatedAt: 0,
};

// How long the routine has been running on the server's clock. `clockOffset`
// is (server time - this device's time).
export function elapsedMs(startedAt: number | null, deviceNow: number, clockOffset: number): number {
  if (startedAt === null) return 0;
  return Math.max(0, deviceNow + clockOffset - startedAt);
}

// 0:00, 1:05, 12:30
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function samePlayState(a: PlayState, b: PlayState): boolean {
  return (
    a.divisionId === b.divisionId &&
    a.roundNumber === b.roundNumber &&
    a.poolLetter === b.poolLetter &&
    a.teamId === b.teamId &&
    a.routineStartedAt === b.routineStartedAt &&
    a.finishedJudges.join() === b.finishedJudges.join() &&
    a.restorableRoutineId === b.restorableRoutineId
  );
}
