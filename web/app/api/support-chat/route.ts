import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getCurrentUserAccess } from '@/lib/authz';
import { promptById } from '@/lib/claude-prompts';
import { recordClaudeUsage } from '@/lib/claude-usage';
import { getSetting } from '@/lib/settings-queries';
import { checkSupportChatLimits } from '@/lib/support-chat-limits';
import { logSupportChat, type SupportPage } from '@/lib/support-chat-queries';

// A low-effort answer takes seconds; this is room for a slow one.
export const maxDuration = 120;

// The conversation so far, ending with the new question. The browser keeps it;
// each question sends it all, and Claude reads the earlier turns from its cache.
const Body = z.object({
  conversationId: z.string().uuid(),
  page: z.enum(['head-judge', 'events', 'judging-trainer']),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(20000),
      })
    )
    .min(1)
    .max(30),
});

const MAX_QUESTION = 2000;

const PAGE_NOTE: Record<SupportPage, string> = {
  'head-judge': 'The person asking is on the Head Judge page.',
  events: 'The person asking is on the Event Creator page.',
  'judging-trainer': 'The person asking is on the Judging Trainer page.',
};

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function apiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The saved Anthropic API key was rejected. Ask an admin to update it in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Claude is busy right now. Try again in a minute.';
  if (err instanceof Anthropic.APIError) return `Claude couldn't answer (error ${err.status}). Try again shortly.`;
  return "Couldn't reach Claude. Check the internet connection and try again.";
}

// Answers a support question, streaming the answer back as plain text. Errors
// before the answer starts come back as JSON { error } with an error status.
export async function POST(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return json({ error: 'Sign in to use the support chat.' }, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'That message could not be sent.' }, 400);
  const { conversationId, page, messages } = parsed.data;
  // The Judging Trainer is for every signed-in user, and so is its chat.
  if (page !== 'judging-trainer' && !access.permissions.has('head_judge') && !access.permissions.has('event_creator')) {
    return json({ error: "You don't have access to the support chat." }, 403);
  }
  // Questions and answers take turns, starting and ending with a question.
  if (messages.some((m, i) => m.role !== (i % 2 === 0 ? 'user' : 'assistant')) || messages.length % 2 === 0) {
    return json({ error: 'That message could not be sent.' }, 400);
  }
  const question = messages[messages.length - 1].content;
  if (question.length > MAX_QUESTION) {
    return json({ error: `Keep a question under ${MAX_QUESTION.toLocaleString()} characters.` }, 400);
  }

  const limited = await checkSupportChatLimits(access.userId);
  if (limited) return json({ error: limited }, 429);
  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) return json({ error: "The support chat isn't set up yet." }, 503);

  const prompt = promptById(page === 'judging-trainer' ? 'judging-trainer' : 'support-chat');
  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: prompt.model,
    max_tokens: prompt.maxTokens,
    // The guide is the same for every question, so it is cached; the page note
    // after it is short. The top-level marker caches the conversation as well,
    // so the next question reads this one's turns from the cache.
    system: [
      { type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: PAGE_NOTE[page] },
    ],
    cache_control: { type: 'ephemeral' },
    messages,
    output_config: { effort: prompt.effort },
    // A safety decline is answered by another model rather than not at all.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });

  // Wait for the first event, so a bad key or a rate limit comes back as an
  // error status rather than a half-started answer.
  const events = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    first = await events.next();
  } catch (err) {
    return json({ error: apiErrorMessage(err) }, 502);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      const send = (text: string) => {
        answer += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        for (let next = first; !next.done; next = await events.next()) {
          const event = next.value;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') send(event.delta.text);
        }
        const final = await stream.finalMessage();
        // Billed whatever the outcome, so logged first.
        await recordClaudeUsage({
          feature: prompt.id,
          model: final.model,
          usage: final.usage,
          stopReason: final.stop_reason,
          userId: access.userId,
        });
        if (final.stop_reason === 'refusal') send(answer ? '\n\n(The answer stopped here.)' : "Sorry, I can't help with that one.");
        else if (final.stop_reason === 'max_tokens') send('\n\n(The answer was cut short. Ask for the rest if you need it.)');
        await logSupportChat({
          conversationId,
          userId: access.userId,
          page,
          question,
          answer,
          stopReason: final.stop_reason,
        });
      } catch (err) {
        if (!stream.aborted) send(`\n\n(${apiErrorMessage(err)})`);
      } finally {
        try {
          controller.close();
        } catch {
          // Already cancelled by the browser.
        }
      }
    },
    cancel() {
      // The chat was closed or a new chat started: stop generating.
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
