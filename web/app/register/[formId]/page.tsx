import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getForm, getRoster } from '@/lib/registration-queries';
import { loadMyRegistration } from '@/lib/registration-actions';
import { RegistrationForm } from '@/app/_components/registration/RegistrationForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/register/[formId]'>): Promise<Metadata> {
  const form = await getForm((await params).formId);
  return { title: form ? form.title || form.eventName : undefined };
}

// The registration form on this site: a link staff can share as well as the embed.
// Signed-in only (the proxy sends anyone else through /login and back).
export default async function RegisterPage({ params }: PageProps<'/register/[formId]'>) {
  const form = await getForm((await params).formId);
  if (!form) notFound();
  const [initial, roster] = await Promise.all([loadMyRegistration(form.id, null), getRoster(form)]);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="rounded-lg border border-gray-200 shadow-sm">
        <RegistrationForm form={form} initial={initial} mode="page" roster={roster} />
      </div>
    </main>
  );
}
