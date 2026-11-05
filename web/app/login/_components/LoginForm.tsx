'use client';

import { useActionState } from 'react';
import { authenticate, signInWithGoogle, signInWithDiscord } from '../actions';
import { useT } from '@/lib/i18n/client';

// The sign-in options the login page offers (lib/login-options.ts decides which). `next` is the
// page that sent them here, which each form passes on so sign-in returns to it.
export function LoginForm({
  showGoogle,
  showPassword,
  next,
}: {
  showGoogle: boolean;
  showPassword: boolean;
  next: string | null;
}) {
  const [state, formAction, pending] = useActionState(authenticate, { error: null });
  const t = useT();
  const nextInput = next && <input type="hidden" name="next" value={next} />;

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6 text-xl font-semibold">{t.login.title}</h1>

      <div className="mb-6 flex flex-col gap-2">
        {showGoogle && (
          <form action={signInWithGoogle}>
            {nextInput}
            <button
              type="submit"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              {t.login.withGoogle}
            </button>
          </form>
        )}
        <form action={signInWithDiscord}>
          {nextInput}
          <button
            type="submit"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            {t.login.withDiscord}
          </button>
        </form>
      </div>

      {showPassword && (
        <>
          <div className="mb-6 flex items-center gap-2 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" />
            {t.login.or}
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form action={formAction} className="flex flex-col gap-3">
            {nextInput}
            <label className="flex flex-col gap-1 text-sm">
              {t.login.email}
              <input name="email" type="email" required className="rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t.login.password}
              <input name="password" type="password" required className="rounded border border-gray-300 px-3 py-2" />
            </label>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="mt-2 rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? t.login.loggingIn : t.login.title}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
