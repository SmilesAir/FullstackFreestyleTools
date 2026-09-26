// How often the screens ask the server for news. The local database is on the
// same hotspot (a few ms away) so its screens ask every second; Neon is slow and
// far away, so those keep the slower rates.
export type PollMode = 'local' | 'remote';

export const HEAD_JUDGE_POLL_MS: Record<PollMode, number> = { remote: 2000, local: 1000 };
export const JUDGE_POLL_MS: Record<PollMode, number> = { remote: 5000, local: 1000 };

// A judge counts as connected while heard from within this many poll intervals
// (two missed polls of slack), weak up to WEAK_SECONDS, then not connected.
export const CONNECTED_INTERVALS = 3;
export const WEAK_SECONDS = 60;
