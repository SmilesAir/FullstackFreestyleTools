import 'server-only';
import { pool } from './db';
import { isMissingTable } from './db-errors';

// The support chat's conversations, kept 90 days so admins can see what people
// ask and improve the guide (lib/support-guide.ts).

export type SupportPage = 'head-judge' | 'events' | 'judging-trainer';

// Saves one question and its answer, and deletes what is older than 90 days.
// Never throws: the answer has already been shown, and keeping it is bookkeeping.
export async function logSupportChat(entry: {
  conversationId: string;
  userId: string;
  page: SupportPage;
  question: string;
  answer: string;
  stopReason: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO support_chat_messages (conversation_id, user_id, page, role, content, stop_reason, created_at)
       VALUES ($1, $2, $3, 'user', $4, NULL, now()),
              ($1, $2, $3, 'assistant', $5, $6, now() + interval '1 millisecond')`,
      [entry.conversationId, entry.userId, entry.page, entry.question, entry.answer, entry.stopReason]
    );
    await pool.query(`DELETE FROM support_chat_messages WHERE created_at < now() - interval '90 days'`);
  } catch (err) {
    if (!isMissingTable(err)) console.error('Could not save the support chat', err);
  }
}

export type SupportConversation = {
  id: string;
  email: string | null;
  page: string;
  startedAt: string;
  messages: { role: 'user' | 'assistant'; content: string; at: string }[];
};

// The most recent conversations, newest first, each with every message in order.
// null when this database doesn't have the table yet.
export async function getSupportChatLog(limit = 25): Promise<SupportConversation[] | null> {
  try {
    const result = await pool.query<{
      conversation_id: string;
      email: string | null;
      page: string;
      role: 'user' | 'assistant';
      content: string;
      created_at: string;
    }>(
      `WITH recent AS (
         SELECT conversation_id, max(created_at) AS last_at
         FROM support_chat_messages GROUP BY conversation_id
         ORDER BY last_at DESC LIMIT $1
       )
       SELECT m.conversation_id, u.email, m.page, m.role, m.content, m.created_at
       FROM support_chat_messages m
       JOIN recent r ON r.conversation_id = m.conversation_id
       LEFT JOIN users u ON u.id = m.user_id
       ORDER BY r.last_at DESC, m.created_at, m.id`,
      [limit]
    );
    const conversations = new Map<string, SupportConversation>();
    for (const r of result.rows) {
      const at = new Date(r.created_at).toISOString();
      let c = conversations.get(r.conversation_id);
      if (!c) {
        c = { id: r.conversation_id, email: r.email, page: r.page, startedAt: at, messages: [] };
        conversations.set(r.conversation_id, c);
      }
      c.messages.push({ role: r.role, content: r.content, at });
    }
    return [...conversations.values()];
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}
