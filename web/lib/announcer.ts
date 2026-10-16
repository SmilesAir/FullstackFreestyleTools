import type { PollMode } from './poll-intervals';

// Shared (client + server) shapes for the Announcer page.

// What the Announcer page polls: who is up on the Head Judge's screen, when
// their routine started (server clock, ms; null = not running) with the
// server's clock when it was read, and a fingerprint of the event's structure
// (when it changes the page reads its data again).
export type AnnouncerPoll = {
  divisionId: string | null;
  roundNumber: number | null;
  poolLetter: string | null;
  teamId: string | null;
  routineStartedAt: number | null;
  serverNow: number;
  structureKey: string;
  mode: PollMode;
};

// Only codes made by randomCode (pool-shortlink.ts) are looked up.
export const ANNOUNCER_CODE = /^[A-Z2-9]{8}$/;
