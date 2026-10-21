'use server';

import { requirePermission } from './authz';
import {
  deletePreset,
  loadEventPresets,
  saveEventSettings,
  savePreset,
  updateEventPreset,
} from './judging-settings-store';

const guard = () => requirePermission('head_judge');

export type SettingsActionResult = { error: string | null };

export async function saveSettings(
  eventId: string,
  rulesId: string,
  values: unknown
): Promise<SettingsActionResult & { rescored?: number }> {
  await guard();
  return saveEventSettings(eventId, rulesId, values);
}

// Saves the values into the event and into its event preset.
export async function saveEventPreset(
  eventId: string,
  rulesId: string,
  values: unknown
): Promise<SettingsActionResult & { rescored?: number }> {
  await guard();
  return updateEventPreset(eventId, rulesId, values);
}

// The head judge chose the event in the Events tab: its event presets are
// loaded back into it.
export async function chooseHeadJudgeEvent(eventId: string): Promise<SettingsActionResult> {
  await guard();
  await loadEventPresets(eventId);
  return { error: null };
}

// `exists` is set when the name is taken and `overwrite` wasn't given.
export async function saveAsPreset(
  rulesId: string,
  name: string,
  values: unknown,
  overwrite: boolean
): Promise<SettingsActionResult & { exists?: boolean }> {
  await guard();
  return savePreset(rulesId, name, values, overwrite);
}

export async function removePreset(id: string): Promise<SettingsActionResult> {
  await guard();
  return deletePreset(id);
}
