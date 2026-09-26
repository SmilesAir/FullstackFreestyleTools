import 'server-only';
import { getMode, getModeState, localConfigured, updateModeState } from './db-mode';
import { pingDb } from './db-diagnostics';
import { fullSync, pendingChanges, pushOnly } from './local-sync';

export type SwitchResult = {
  ok: boolean;
  message: string;
  // The switch wasn't made because of trouble the head judge may choose to
  // override (send the same request again with `force`).
  needsConfirm?: boolean;
};

// Points the whole server at the local Postgres or at Neon, syncing first so
// nothing is lost or left behind.
export async function switchMode(
  target: 'local' | 'remote',
  opts: { eventId?: string | null; force?: boolean }
): Promise<SwitchResult> {
  if (!localConfigured()) return { ok: false, message: 'This server has no local database address yet: set it in the database panel.' };
  const state = getModeState();

  if (target === 'remote') {
    if (getMode() === 'remote') return { ok: true, message: 'Already using Postgres (Neon).' };
    const sent = await pushOnly();
    if (!sent.ok && !opts.force) {
      const unsent = await pendingChanges(state.localEventId ?? '').catch(() => null);
      return {
        ok: false,
        needsConfirm: true,
        message: `Could not send the local changes to Neon${unsent ? ` (${unsent} waiting)` : ''}: ${sent.message} Switch anyway? They stay on this computer and are sent the next time you go local.`,
      };
    }
    updateModeState({ mode: 'remote' });
    // Anything the judges saved locally between that send and the switch.
    void pushOnly().catch(() => {});
    return {
      ok: true,
      message: sent.ok ? 'Now using Postgres (Neon).' : 'Now using Postgres (Neon). Local changes are still waiting to be sent.',
    };
  }

  if (getMode() === 'local') return { ok: true, message: 'Already using the local server.' };
  const eventId = opts.eventId ?? state.localEventId;
  if (!eventId) return { ok: false, message: 'Choose the event to run on the local server first.' };
  const local = await pingDb('local');
  if (!local.ok) return { ok: false, message: `The local database isn't answering: ${local.error}` };

  // Leaving another event behind: send what it has first.
  if (state.localEventId && state.localEventId !== eventId) {
    const sent = await pushOnly();
    if (!sent.ok && !opts.force) {
      return { ok: false, needsConfirm: true, message: `Could not send the previous event's changes to Neon: ${sent.message} Switch anyway?` };
    }
  }

  const synced = await fullSync(eventId);
  if (!synced.ok) {
    const hasCopy = state.localEventId === eventId && state.lastFullAt !== null;
    if (hasCopy && opts.force) {
      updateModeState({ mode: 'local' });
      return { ok: true, message: 'Now using the local server with the last copy from Neon.' };
    }
    return {
      ok: false,
      needsConfirm: hasCopy,
      message: hasCopy
        ? `Couldn't reach Neon to update the local copy: ${synced.message} Use the copy from ${new Date(state.lastFullAt!).toLocaleString()} instead?`
        : `Couldn't prepare the local copy: ${synced.message}`,
    };
  }
  updateModeState({ mode: 'local', localEventId: eventId });
  return { ok: true, message: 'Now using the local server.' };
}
