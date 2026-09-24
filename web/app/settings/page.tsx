import { getAllSettings } from '@/lib/settings-queries';
import { SETTINGS } from '@/lib/settings';
import { SettingForm } from './_components/SettingForm';

export default async function SettingsPage() {
  const current = await getAllSettings();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      {SETTINGS.map((def) => (
        <SettingForm key={def.key} def={def} currentValue={current[def.key] ?? null} />
      ))}
    </main>
  );
}
