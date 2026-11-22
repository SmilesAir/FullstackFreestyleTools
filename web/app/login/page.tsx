import type { Metadata } from 'next';
import { getT } from '@/lib/i18n/server';
import { SHOW_GOOGLE, showPasswordLogin } from '@/lib/login-options';
import { safeNextPath } from '@/lib/login-redirect';
import { LoginForm } from './_components/LoginForm';

// Read on each request: whether this is the hosted site decides the password form.
export const dynamic = 'force-dynamic';

// Link-preview crawlers (Discord, etc.) aren't signed in, so a shared protected link lands
// here; describe the page they were sent from instead of the generic site text.
export async function generateMetadata({ searchParams }: PageProps<'/login'>): Promise<Metadata> {
  const next = safeNextPath((await searchParams).callbackUrl);
  if (next === '/judging-trainer' || next?.startsWith('/judging-trainer/') || next?.startsWith('/judging-trainer?')) {
    const { shareTitle: title, shareDescription: description } = (await getT()).tools.judging_trainer;
    return { title, description, openGraph: { title, description } };
  }
  return {};
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const next = safeNextPath((await searchParams).callbackUrl);
  return <LoginForm showGoogle={SHOW_GOOGLE} showPassword={showPasswordLogin()} next={next} />;
}
