import { getClaudeUsage } from '@/lib/claude-usage';
import { getAllSettings } from '@/lib/settings-queries';
import { SETTINGS, SETTING_SECTIONS } from '@/lib/settings';
import { ClaudeSection } from './_components/ClaudeSection';
import { PublicApiSection } from './_components/PublicApiSection';
import { SettingForm } from './_components/SettingForm';

export default async function SettingsPage() {
  const [current, usage] = await Promise.all([getAllSettings(), getClaudeUsage()]);
  // A setting's saved value, or its documented default.
  const value = (key: string) => current[key]?.trim() || SETTINGS.find((d) => d.key === key)?.default || '';

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      {SETTING_SECTIONS.map((section) => {
        const forms = SETTINGS.filter((def) => def.section === section.id).map((def) => (
          <SettingForm key={def.key} def={def} currentValue={current[def.key] ?? null} />
        ));
        // Claude has its own richer section (prompts, cost); its key form goes inside it.
        if (section.id === 'claude') return <ClaudeSection key={section.id} keyForm={forms} usage={usage} />;
        // The public API lists its endpoints above its rate limit settings.
        if (section.id === 'api') {
          return (
            <PublicApiSection
              key={section.id}
              site={(value('public_site_url') || 'https://freestylejudge.com').replace(/\/+$/, '')}
              limitForms={forms}
              limits={{
                perMinute: value('api_rate_limit_requests'),
                windowSeconds: value('api_rate_limit_window_seconds'),
                perDay: value('api_rate_limit_daily_requests'),
                perMonth: value('api_rate_limit_monthly_requests'),
              }}
            />
          );
        }
        return (
          <section key={section.id} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {forms}
          </section>
        );
      })}
    </main>
  );
}
