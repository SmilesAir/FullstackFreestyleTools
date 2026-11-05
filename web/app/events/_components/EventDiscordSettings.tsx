'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendEventDiscordTest, setEventDiscordChannel } from '@/lib/event-creator-actions';
import type { EventDiscordStatus } from '@/lib/discord';
import { useT } from '@/lib/i18n/client';

// The event's Discord channel: the bot keeps one thread there for the event and
// posts each round's play order (Event Creator) and each pool's results (when the
// Head Judge publishes them) into it.
export function EventDiscordSettings({ eventId, status }: { eventId: string; status: EventDiscordStatus }) {
  const router = useRouter();
  const t = useT();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (status.error) return <p className="text-sm text-red-600">{status.error}</p>;

  function save(value: string) {
    startTransition(async () => {
      const result = await setEventDiscordChannel(eventId, value);
      if (result.error) return setMessage({ text: result.error, error: true });
      setInput('');
      setMessage({ text: value.trim() ? t.events.channelSaved : t.events.channelRemoved, error: false });
      router.refresh();
    });
  }

  function test() {
    startTransition(async () => {
      const result = await sendEventDiscordTest(eventId);
      setMessage(result.error ? { text: result.error, error: true } : { text: t.events.testPosted, error: false });
      if (!result.error) router.refresh();
    });
  }

  const current = status.channel
    ? `#${status.channel.name}${status.channel.serverName ? t.events.inServer(status.channel.serverName) : ''}`
    : status.channelId;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-gray-600">
        {t.events.discordHelp}
      </p>

      {status.channelId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {t.events.channel} <span className="font-medium">{current}</span>
          </span>
          {status.hasThread && <span className="text-xs text-gray-500">{t.events.threadCreated}</span>}
          <button
            type="button"
            onClick={test}
            disabled={pending || status.channelError !== null}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            {t.events.sendTestPost}
          </button>
          <button
            type="button"
            onClick={() => confirm(t.events.stopPostingConfirm) && save('')}
            disabled={pending}
            className="text-xs text-red-600 underline disabled:opacity-50"
          >
            {t.events.remove}
          </button>
        </div>
      ) : (
        <p className="text-gray-500">{t.events.noChannel}</p>
      )}
      {status.channelError && <p className="text-red-600">{status.channelError}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(input);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.events.channelPlaceholder}
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
        />
        <button type="submit" disabled={pending || !input.trim()} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          {status.channelId ? t.events.changeChannel : t.events.saveChannel}
        </button>
      </form>
      {message && <p className={message.error ? 'text-red-600' : 'text-green-700'}>{message.text}</p>}

      <p className="text-xs text-gray-500">
        {t.events.botHelp}
      </p>
    </div>
  );
}
