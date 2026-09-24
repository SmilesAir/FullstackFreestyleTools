'use client';

import { useActionState } from 'react';
import { authenticate, signInWithGoogle, signInWithDiscord } from './actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(authenticate, { error: null });

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6 text-xl font-semibold">Log in</h1>

      <div className="mb-6 flex flex-col gap-2">
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Sign in with Google
          </button>
        </form>
        <form action={signInWithDiscord}>
          <button
            type="submit"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Sign in with Discord
          </button>
        </form>
      </div>

      <div className="mb-6 flex items-center gap-2 text-xs text-gray-400">
        <div className="h-px flex-1 bg-gray-200" />
        or
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
