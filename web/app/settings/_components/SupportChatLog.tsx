import type { SupportConversation } from '@/lib/support-chat-queries';

const PAGE_NAMES: Record<string, string> = { 'head-judge': 'Head Judge', events: 'Event Creator' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// The support chat's recent conversations, newest first: who asked, where, and
// the first question, with the whole conversation behind a click.
export function SupportChatLog({ conversations }: { conversations: SupportConversation[] | null }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Recent conversations</h3>
      <p className="text-xs text-gray-500">
        Kept 90 days, then deleted. What people ask here shows what the guide the chat answers from
        (web/lib/support-guide.ts) is missing.
      </p>
      {conversations === null ? (
        <p className="text-sm text-gray-500">This database doesn&apos;t have the support chat table yet (run the new lines of backend/schema.sql).</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No questions asked yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => {
            const first = c.messages.find((m) => m.role === 'user')?.content ?? '';
            const questions = c.messages.filter((m) => m.role === 'user').length;
            return (
              <li key={c.id} className="rounded border border-gray-200">
                <details>
                  <summary className="cursor-pointer px-3 py-2 text-sm">
                    <span className="text-gray-500">
                      {when(c.startedAt)} · {c.email ?? 'unknown user'} · {PAGE_NAMES[c.page] ?? c.page} ·{' '}
                      {questions} {questions === 1 ? 'question' : 'questions'}
                    </span>
                    <span className="mt-0.5 block truncate">{first}</span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-gray-200 px-3 py-2 text-sm">
                    {c.messages.map((m, i) => (
                      <div key={i}>
                        <div className="text-xs font-medium text-gray-500">
                          {m.role === 'user' ? 'Question' : 'Answer'} · {when(m.at)}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
