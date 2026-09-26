import { getClaudeUsage } from '@/lib/claude-usage';
import { getAllSettings } from '@/lib/settings-queries';
import { SETTINGS, SETTING_SECTIONS } from '@/lib/settings';
import { ClaudeSection } from './_components/ClaudeSection';
import { SettingForm } from './_components/SettingForm';

export default async function SettingsPage() {
  const [current, usage] = await Promise.all([getAllSettings(), getClaudeUsage()]);

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      {SETTING_SECTIONS.map((section) => {
        const forms = SETTINGS.filter((def) => def.section === section.id).map((def) => (
          <SettingForm key={def.key} def={def} currentValue={current[def.key] ?? null} />
        ));
        // Claude has its own richer section (prompts, cost); its key form goes inside it.
        if (section.id === 'claude') return <ClaudeSection key={section.id} keyForm={forms} usage={usage} />;
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
