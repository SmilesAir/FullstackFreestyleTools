import { SHOW_GOOGLE, showPasswordLogin } from '@/lib/login-options';
import { safeNextPath } from '@/lib/login-redirect';
import { LoginForm } from './_components/LoginForm';

// Read on each request: whether this is the hosted site decides the password form.
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const next = safeNextPath((await searchParams).callbackUrl);
  return <LoginForm showGoogle={SHOW_GOOGLE} showPassword={showPasswordLogin()} next={next} />;
}
