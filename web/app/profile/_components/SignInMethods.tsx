'use client';

import { useState, useTransition } from 'react';
import { connectSignIn, disconnectSignIn } from '@/lib/profile-actions';
import { useT } from '@/lib/i18n/client';

type Login = { provider: 'google' | 'discord'; email: string | null };

const LABELS: Record<Login['provider'], string> = { google: 'Google', discord: 'Discord' };

// The ways into this account: its password, and each connected Google/Discord sign-in.
// Connecting one makes it open this account from then on, whatever its email.
export function SignInMethods({
  logins,
  hasPassword,
  notice,
  showGoogle,
}: {
  logins: Login[];
  hasPassword: boolean;
  // From the URL after a Connect: 'done' or 'taken'.
  notice: string | null;
  // Offer Google (lib/login-options.ts). An already-connected Google is listed either way,
  // so it can be disconnected.
  showGoogle: boolean;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ways = logins.length + (hasPassword ? 1 : 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {t.profile.connectHelp}
      </p>
      {notice === 'done' && <p className="text-sm text-green-700">{t.profile.connectDone}</p>}
      {notice === 'taken' && <p className="text-sm text-red-600">{t.profile.connectTaken}</p>}
      <ul className="flex flex-col gap-2">
        <li className="flex items-center justify-between rounded border border-gray-300 p-3 text-sm">
          <span>{t.profile.emailPassword}</span>
          <span className="text-gray-500">{hasPassword ? t.profile.set : t.profile.notSet}</span>
        </li>
        {(['google', 'discord'] as const)
          .filter((provider) => provider !== 'google' || showGoogle || logins.some((l) => l.provider === 'google'))
          .map((provider) => {
          const connected = logins.filter((l) => l.provider === provider);
          return (
            <li key={provider} className="flex items-center justify-between gap-3 rounded border border-gray-300 p-3 text-sm">
              <div className="flex min-w-0 flex-col">
                <span>{LABELS[provider]}</span>
                {connected.map((l, i) => (
                  <span key={i} className="truncate text-xs text-gray-500">
                    {l.email ?? t.profile.connected}
                  </span>
                ))}
              </div>
              {connected.length > 0 ? (
                <button
                  type="button"
                  disabled={pending || ways <= connected.length}
                  title={ways <= connected.length ? t.profile.onlyWay : undefined}
                  onClick={() =>
                    confirm(t.profile.disconnectConfirm(LABELS[provider])) &&
                    startTransition(async () => setError((await disconnectSignIn(provider)).error))
                  }
                  className="shrink-0 text-xs text-red-600 underline disabled:opacity-40"
                >
                  {t.profile.disconnect}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => startTransition(() => connectSignIn(provider))}
                  className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  {t.profile.connect}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
