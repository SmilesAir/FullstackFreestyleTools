'use server';

import { requirePermission } from './authz';
import { deletePreset, saveEventSettings, savePreset } from './judging-settings-store';

const guard = () => requirePermission('head_judge');

export type SettingsActionResult = { error: string | null };

export async function saveSettings(eventId: string, rulesId: string, values: unknown): Promise<SettingsActionResult> {
  await guard();
  return saveEventSettings(eventId, rulesId, values);
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
