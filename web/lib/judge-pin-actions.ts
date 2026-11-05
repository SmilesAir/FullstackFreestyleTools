'use server';

import { enterPin, type PinEntryResult } from './judge-pin';
import { getT } from './i18n/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A judge typing the event's PIN on the PIN pad. Public on purpose (judges
// don't log in); guessing is slowed down in enterPin. `remember` keeps the PIN on
// this device between browser sessions.
export async function enterJudgePin(eventId: string, pin: string, remember: boolean): Promise<PinEntryResult> {
  const t = await getT();
  if (!UUID.test(eventId) || typeof pin !== 'string') return { ok: false, error: t.errors.unknownEvent };
  try {
    return await enterPin(eventId, pin, remember === true);
  } catch {
    return { ok: false, error: t.judging.pinCouldNotCheck };
  }
}
