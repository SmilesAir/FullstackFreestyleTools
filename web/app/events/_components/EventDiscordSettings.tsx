'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendEventDiscordTest, setEventDiscordChannel } from '@/lib/event-creator-actions';
import type { EventDiscordStatus } from '@/lib/discord';

// The event's Discord channel: the bot keeps one thread there for the event and
// posts each round's play order (Event Creator) and each pool's results (when the
// Head Judge publishes them) into it.
export function EventDiscordSettings({ eventId, status }: { eventId: string; status: EventDiscordStatus }) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  if (status.error) return <p className="text-sm text-red-600">{status.error}</p>;

  function save(value: string) {
    startTransition(async () => {
      const result = await setEventDiscordChannel(eventId, value);
      if (result.error) return setMessage({ text: result.error, error: true });
      setInput('');
      setMessage({ text: value.trim() ? 'Channel saved.' : 'Channel removed.', error: false });
      router.refresh();
    });
  }

  function test() {
    startTransition(async () => {
      const result = await sendEventDiscordTest(eventId);
      setMessage(result.error ? { text: result.error, error: true } : { text: 'Posted to the event thread.', error: false });
      if (!result.error) router.refresh();
    });
  }

  const current = status.channel
    ? `#${status.channel.name}${status.channel.serverName ? ` in ${status.channel.serverName}` : ''}`
    : status.channelId;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-gray-600">
        The bot keeps one thread for this event in the channel and posts each round&apos;s play order (the button on a round) and each
        pool&apos;s results (when the Head Judge publishes them), as an image with the pool&apos;s public link.
      </p>

      {status.channelId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            Channel: <span className="font-medium">{current}</span>
          </span>
          {status.hasThread && <span className="text-xs text-gray-500">· thread created</span>}
          <button
            type="button"
            onClick={test}
            disabled={pending || status.channelError !== null}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
          >
            Send test post
          </button>
          <button
            type="button"
            onClick={() => confirm('Stop posting this event to Discord?') && save('')}
            disabled={pending}
            className="text-xs text-red-600 underline disabled:opacity-50"
          >
            remove
          </button>
        </div>
      ) : (
        <p className="text-gray-500">No channel set: nothing is posted to Discord.</p>
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
          placeholder="Channel link or id (right-click the channel → Copy Link)"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1"
        />
        <button type="submit" disabled={pending || !input.trim()} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          {status.channelId ? 'Change channel' : 'Save channel'}
        </button>
      </form>
      {message && <p className={message.error ? 'text-red-600' : 'text-green-700'}>{message.text}</p>}

      <p className="text-xs text-gray-500">
        The bot (Settings → Discord) must be in the server with View Channel, Send Messages, Create Public Threads, Send Messages in
        Threads and Attach Files in this channel, and Mention @everyone, @here and All Roles for results to ping @here. Text,
        announcement and forum channels all work. A play order tags each pool&apos;s players and judges who have linked their Discord
        account on their profile.
      </p>
    </div>
  );
}
