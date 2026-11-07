import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getForm, getRegistrant, isHandoffCode } from '@/lib/registration-queries';
import { ConnectHandoff } from './ConnectHandoff';

export const dynamic = 'force-dynamic';

// The window the embed opens to sign in (see registration-queries.ts): sign in, then
// Continue lets the embed register as this account. Without the embed's code it's
// just the registration page.
export default async function RegistrationConnectPage({ params, searchParams }: PageProps<'/register/[formId]/connect'>) {
  const [{ formId }, { n }] = await Promise.all([params, searchParams]);
  const form = await getForm(formId);
  if (!form) notFound();
  if (!isHandoffCode(n)) redirect(`/register/${form.id}`);
  const here = `/register/${form.id}/connect?n=${n}`;
  const signIn = `/login?callbackUrl=${encodeURIComponent(here)}`;
  const session = await auth();
  if (!session?.user?.id) redirect(signIn);
  const registrant = await getRegistrant(session.user.id);
  return (
    <ConnectHandoff
      formId={form.id}
      code={n}
      eventName={form.title || form.eventName}
      who={registrant?.email ?? registrant?.name ?? ''}
      switchHref={signIn}
    />
  );
}
