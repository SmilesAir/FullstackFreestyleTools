import { SHOW_GOOGLE, showPasswordLogin } from '@/lib/login-options';
import { LoginForm } from './_components/LoginForm';

// Read on each request: whether this is the hosted site decides the password form.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm showGoogle={SHOW_GOOGLE} showPassword={showPasswordLogin()} />;
}
