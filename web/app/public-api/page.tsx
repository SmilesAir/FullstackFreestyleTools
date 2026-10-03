import { getAllSettings } from '@/lib/settings-queries';
import { SETTINGS } from '@/lib/settings';
import { SettingForm } from '../_components/SettingForm';
import { PublicApiSection } from './_components/PublicApiSection';

export default async function PublicApiPage() {
  const current = await getAllSettings();
  // A setting's saved value, or its documented default.
  const value = (key: string) => current[key]?.trim() || SETTINGS.find((d) => d.key === key)?.default || '';

  const limitForms = SETTINGS.filter((def) => def.section === 'api').map((def) => (
    <SettingForm key={def.key} def={def} currentValue={current[def.key] ?? null} />
  ));

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Public API</h1>
      <PublicApiSection
        site={(value('public_site_url') || 'https://freestylejudge.com').replace(/\/+$/, '')}
        limitForms={limitForms}
        limits={{
          perMinute: value('api_rate_limit_requests'),
          windowSeconds: value('api_rate_limit_window_seconds'),
          perDay: value('api_rate_limit_daily_requests'),
          perMonth: value('api_rate_limit_monthly_requests'),
        }}
      />
    </main>
  );
}
