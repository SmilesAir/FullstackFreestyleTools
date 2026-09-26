'use server';

import { requirePermission } from './authz';
import { getMode } from './db-mode';
import { validateParams, type ParamProblem, type PointsParams } from './points/params';
import { runGenerator, type GeneratorOutput } from './points/run';
import { saveParams } from './points-params-store';
import { DATE_PATTERN, deleteVersion, publishVersion, setVersionHidden } from './points-snapshots';

const guard = () => requirePermission('rankings_generator');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 20000;

type Input = { eventIds: string[]; excludedDivisionIds: string[]; params: unknown };

// `withRatings` false leaves the ratings out (they are only worked out and sent when the ratings tab is open).
type PreviewInput = Input & { withRatings: boolean };

// Checks what the browser sent: ids are UUIDs, the parameters are valid. The result is
// what the calculation is given (nothing from the browser is used unchecked).
function checkInput(input: Input):
  | { ok: true; selection: { eventIds: string[]; excludedDivisionIds: string[] }; params: PointsParams }
  | { ok: false; error: string; problems?: ParamProblem[] } {
  const ids = (list: unknown) => Array.isArray(list) && list.length <= MAX_IDS && list.every((id) => typeof id === 'string' && UUID.test(id));
  if (!ids(input.eventIds) || !ids(input.excludedDivisionIds)) return { ok: false, error: 'Unknown events or divisions.' };
  const checked = validateParams(input.params);
  if (!checked.ok) return { ok: false, error: 'Some settings are not valid.', problems: checked.problems };
  return { ok: true, selection: { eventIds: input.eventIds, excludedDivisionIds: input.excludedDivisionIds }, params: checked.params };
}

export type PreviewResult = { ok: true; output: GeneratorOutput } | { ok: false; error: string; problems?: ParamProblem[] };

// The rankings for the chosen events and the ratings, with the settings as they are on screen.
export async function previewPoints(input: PreviewInput): Promise<PreviewResult> {
  await guard();
  const checked = checkInput(input);
  if (!checked.ok) return checked;
  try {
    return { ok: true, output: await runGenerator(checked.selection, checked.params, { skipRatings: input.withRatings !== true }) };
  } catch {
    return { ok: false, error: 'Could not calculate the rankings. Try again in a moment.' };
  }
}

export type ActionResult = { ok: boolean; message: string; problems?: ParamProblem[] };

// Calculates everything again from the database and publishes it under `date`.
export async function publishPoints(input: Input & { date: string }): Promise<ActionResult> {
  await guard();
  // Published data must land in Neon, where the public API reads it.
  if (getMode() === 'local') return { ok: false, message: 'Switch the server to Postgres (Neon) before publishing.' };
  const date = typeof input.date === 'string' ? input.date.trim() : '';
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, message: 'Use a date like 2026-9-25.' };
  const checked = checkInput(input);
  if (!checked.ok) return { ok: false, message: checked.error, problems: checked.problems };
  if (checked.selection.eventIds.length === 0) return { ok: false, message: 'Choose at least one event.' };
  try {
    const output = await runGenerator(checked.selection, checked.params, { fresh: true });
    if (output.open.length === 0) return { ok: false, message: 'Nothing to publish: the chosen events have no counted divisions.' };
    await publishVersion(
      date,
      { open: output.open, women: output.women, ratings: output.ratings },
      {
        events: output.counts.events,
        divisions: output.counts.divisions,
        players: output.open.length + output.women.length,
        from: output.counts.from,
        to: output.counts.to,
        generatedAt: new Date().toISOString(),
        params: checked.params,
      }
    );
    return {
      ok: true,
      message: `Published ${date}: ${output.open.length} open and ${output.women.length} women ranked, ${output.ratings.length} rated. The live rankings used by the Event Creator were updated too.`,
    };
  } catch {
    return { ok: false, message: 'Could not publish. Nothing was changed; try again in a moment.' };
  }
}

// The settings the tool opens with next time.
export async function saveDefaultParams(params: unknown): Promise<ActionResult> {
  await guard();
  const checked = validateParams(params);
  if (!checked.ok) return { ok: false, message: 'Some settings are not valid.', problems: checked.problems };
  await saveParams(checked.params);
  return { ok: true, message: 'Saved as the defaults.' };
}

const checkDate = (date: unknown): date is string => typeof date === 'string' && DATE_PATTERN.test(date);

export async function hideVersion(date: string, hidden: boolean): Promise<ActionResult> {
  await guard();
  if (!checkDate(date)) return { ok: false, message: 'Unknown version.' };
  await setVersionHidden(date, hidden);
  return { ok: true, message: hidden ? 'Hidden from the results pages.' : 'Shown on the results pages again.' };
}

export async function removeVersion(date: string): Promise<ActionResult> {
  await guard();
  if (!checkDate(date)) return { ok: false, message: 'Unknown version.' };
  await deleteVersion(date);
  return { ok: true, message: 'Deleted.' };
}
