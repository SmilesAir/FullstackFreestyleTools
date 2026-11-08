import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isFormTab } from '@/lib/registration';
import { getForm, getRoster } from '@/lib/registration-queries';
import { loadMyRegistration } from '@/lib/registration-actions';
import { RegistrationForm } from '@/app/_components/registration/RegistrationForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/register/[formId]'>): Promise<Metadata> {
  const form = await getForm((await params).formId);
  return { title: form ? form.title || form.eventName : undefined };
}

// The registration form on this site: a link staff can share as well as the embed, and the
// embed's "register in a new tab". Signed out, it offers sign-in (through /login, or through
// a sign-in window when this page has been put in another site's iframe). ?tab=pay|donate|players
// opens on that tab (a Donate link to share).
export default async function RegisterPage({ params, searchParams }: PageProps<'/register/[formId]'>) {
  const [{ formId }, { tab }] = await Promise.all([params, searchParams]);
  const form = await getForm(formId);
  if (!form) notFound();
  const [initial, roster] = await Promise.all([loadMyRegistration(form.id, null), getRoster(form)]);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-lg border border-gray-200 shadow-sm">
        <RegistrationForm form={form} initial={initial} mode="page" roster={roster} initialTab={isFormTab(tab) ? tab : undefined} />
      </div>
    </main>
  );
}
