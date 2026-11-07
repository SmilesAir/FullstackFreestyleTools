import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { isLocale } from '@/lib/i18n/locales';
import { getForm, getRoster } from '@/lib/registration-queries';
import { loadMyRegistration } from '@/lib/registration-actions';
import { RegistrationForm } from '@/app/_components/registration/RegistrationForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/embed/register/[formId]'>): Promise<Metadata> {
  const form = await getForm((await params).formId);
  return { title: form ? form.title || form.eventName : undefined, robots: { index: false } };
}

// The registration form as a tournament's website shows it, in an iframe (the code
// comes from the Event Registration tool's Embed tab). ?lang=en|es sets the language,
// since this site's language cookie isn't sent inside another site.
export default async function RegistrationEmbedPage({ params, searchParams }: PageProps<'/embed/register/[formId]'>) {
  const [{ formId }, { lang }] = await Promise.all([params, searchParams]);
  const form = await getForm(formId);
  if (!form) notFound();
  const locale = isLocale(lang) ? lang : await getLocale();
  const [initial, roster] = await Promise.all([loadMyRegistration(form.id, null), getRoster(form)]);
  return (
    <LocaleProvider locale={locale}>
      <div className="registration-embed">
        <RegistrationForm form={form} initial={initial} mode="embed" roster={roster} />
      </div>
    </LocaleProvider>
  );
}
