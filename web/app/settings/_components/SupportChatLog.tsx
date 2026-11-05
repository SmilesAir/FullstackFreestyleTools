import type { SupportConversation } from '@/lib/support-chat-queries';
import { getLocale, getT } from '@/lib/i18n/server';
import { formatShortDateTime } from '@/lib/i18n/format';



// The support chat's recent conversations, newest first: who asked, where, and
// the first question, with the whole conversation behind a click.
export async function SupportChatLog({ conversations }: { conversations: SupportConversation[] | null }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const when = (iso: string) => formatShortDateTime(locale, iso);
  const PAGE_NAMES: Record<string, string> = {
    'head-judge': t.tools.head_judge.label,
    events: t.tools.event_creator.label,
    'judging-trainer': t.tools.judging_trainer.label,
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">{t.admin.recentConversations}</h3>
      <p className="text-xs text-gray-500">
        {t.admin.keptDays}
      </p>
      {conversations === null ? (
        <p className="text-sm text-gray-500">{t.admin.noChatTable}</p>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-gray-500">{t.admin.noQuestions}</p>
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
                      {when(c.startedAt)} · {c.email ?? t.admin.unknownUser} · {PAGE_NAMES[c.page] ?? c.page} ·{' '}
                      {t.admin.questions(questions)}
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
