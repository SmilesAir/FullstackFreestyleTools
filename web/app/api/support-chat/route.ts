import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getCurrentUserAccess } from '@/lib/authz';
import { promptById } from '@/lib/claude-prompts';
import { recordClaudeUsage } from '@/lib/claude-usage';
import { POOL_LETTERS } from '@/lib/event-creator';
import { explainPool, listPoolsForChat } from '@/lib/results-explain';
import { getSetting } from '@/lib/settings-queries';
import { checkSupportChatLimits } from '@/lib/support-chat-limits';
import { logSupportChat, type SupportPage } from '@/lib/support-chat-queries';

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaTool = Anthropic.Beta.Messages.BetaTool;
type BetaToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;

// A how-to answer takes seconds; looking up and explaining a pool's results
// takes a few requests, so this is room for a slow one of those.
export const maxDuration = 300;

// The conversation so far, ending with the new question. The browser keeps it;
// each question sends it all, and Claude reads the earlier turns from its cache.
// `eventId` is the event open on the Head Judge page, whose results the chat
// may read.
const Body = z.object({
  conversationId: z.string().uuid(),
  page: z.enum(['head-judge', 'events', 'judging-trainer']),
  eventId: z.string().uuid().optional(),
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
// Requests to Claude for one answer: looking up pools and results, then answering.
const MAX_REQUESTS = 6;
// Explaining results is reasoning over numbers, so once Claude has looked
// something up the rest of the answer gets more effort than a how-to answer.
const RESULTS_EFFORT = 'medium';

const PAGE_NOTE: Record<SupportPage, string> = {
  'head-judge': 'The person asking is on the Head Judge page.',
  events: 'The person asking is on the Event Creator page.',
  'judging-trainer': 'The person asking is on the Judging Trainer page.',
};
const RESULTS_NOTE =
  'They have an event open, and the list_pools and get_pool_results tools read its pools and results. Use them for any question about this event\'s scores, places or judges.';

// What the chat can look up on the Head Judge page: the open event's pools,
// and one pool's results in full. The same tools every time, so they are
// cached with the guide.
const TOOLS: BetaTool[] = [
  {
    name: 'list_pools',
    description:
      "Lists the open event's pools (division, round, pool letter, team names) with the ids get_pool_results needs. Give a query such as \"open pairs finals\" or a player's name to narrow it; every word must start a word of the pool's name or team names.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words to narrow the list by; empty for every pool.' } },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
  {
    name: 'get_pool_results',
    description:
      "One pool's results in full: how each category is scored with this event's settings, the standings, and for each team every judge's submitted score, baseline, percentage change, note counts, counted and dropped notes, how their notes fell over the routine, and for Difficulty every move (time, numberline position, rating, points).",
    input_schema: {
      type: 'object',
      properties: {
        division_id: { type: 'string' },
        round_number: { type: 'integer' },
        pool: { type: 'string', enum: [...POOL_LETTERS] },
      },
      required: ['division_id', 'round_number', 'pool'],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
];

const ListPoolsInput = z.object({ query: z.string().max(200) });
const PoolResultsInput = z.object({
  division_id: z.string().uuid(),
  round_number: z.number().int().min(1),
  pool: z.enum(POOL_LETTERS),
});

// Runs one tool call for the open event. The answer is JSON text; a call that
// can't be run says why, marked as an error.
async function runTool(eventId: string, call: BetaToolUse): Promise<BetaToolResult> {
  const reply = (content: unknown, isError = false): BetaToolResult => ({
    type: 'tool_result',
    tool_use_id: call.id,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    ...(isError ? { is_error: true } : {}),
  });
  try {
    if (call.name === 'list_pools') {
      const input = ListPoolsInput.safeParse(call.input);
      if (!input.success) return reply('The query must be text.', true);
      return reply(await listPoolsForChat(eventId, input.data.query));
    }
    if (call.name === 'get_pool_results') {
      const input = PoolResultsInput.safeParse(call.input);
      if (!input.success) return reply('Give a division_id, round_number and pool letter from list_pools.', true);
      const { division_id, round_number, pool } = input.data;
      const result = await explainPool(eventId, division_id, round_number, pool);
      return result ? reply(result) : reply('No such pool in this event. Use list_pools to find it.', true);
    }
    return reply(`There is no tool called ${call.name}.`, true);
  } catch {
    return reply('The results could not be read from the database. Try again shortly.', true);
  }
}

// What the person sees while a tool runs, so the pause isn't silent.
function lookingUp(calls: BetaToolUse[]): string {
  return calls.some((c) => c.name === 'get_pool_results') ? '(Looking up the results…)\n\n' : '(Looking up the pools…)\n\n';
}

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
// On the Head Judge page with an event open, Claude may look up that event's
// pools and results (several requests to Claude, streamed as one answer).
export async function POST(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return json({ error: 'Sign in to use the support chat.' }, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'That message could not be sent.' }, 400);
  const { conversationId, page, eventId, messages } = parsed.data;
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

  // Results are for those who can see them on the Head Judge page.
  const resultsEventId =
    page === 'head-judge' && eventId && (access.isAdmin || access.permissions.has('head_judge')) ? eventId : null;

  const prompt = promptById(page === 'judging-trainer' ? 'judging-trainer' : 'support-chat');
  const client = new Anthropic({ apiKey });
  const conversation: BetaMessageParam[] = [...messages];
  const ask = (effort: 'low' | 'medium') =>
    client.beta.messages.stream({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      ...(resultsEventId ? { tools: TOOLS } : {}),
      // The guide is the same for every question, so it is cached; the page note
      // after it is short. The top-level marker caches the conversation as well,
      // so the next question (or the next request after a lookup) reads this
      // one's turns from the cache.
      system: [
        { type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: resultsEventId ? `${PAGE_NOTE[page]} ${RESULTS_NOTE}` : PAGE_NOTE[page] },
      ],
      cache_control: { type: 'ephemeral' },
      messages: conversation,
      output_config: { effort },
      // A safety decline is answered by another model rather than not at all.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  let stream = ask(prompt.effort);

  // Wait for the first event, so a bad key or a rate limit comes back as an
  // error status rather than a half-started answer.
  let events = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    first = await events.next();
  } catch (err) {
    return json({ error: apiErrorMessage(err) }, 502);
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      let stopReason: string | null = null;
      const send = (text: string) => {
        answer += text;
        controller.enqueue(encoder.encode(text));
      };
      try {
        for (let requests = 1; ; requests++) {
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
          stopReason = final.stop_reason;
          const calls = final.content.filter((b): b is BetaToolUse => b.type === 'tool_use');
          // A refusal or running out of room can cut a tool call off: never run those.
          if (final.stop_reason !== 'tool_use' || calls.length === 0 || !resultsEventId || cancelled) break;
          if (requests >= MAX_REQUESTS) {
            send(answer ? '\n\n(The answer stopped here: it needed too many lookups. Try a narrower question.)' : 'That needed too many lookups. Try a narrower question, naming the division, round and pool.');
            break;
          }
          if (answer && !answer.endsWith('\n')) send('\n\n');
          send(lookingUp(calls));
          const results = await Promise.all(calls.map((call) => runTool(resultsEventId, call)));
          conversation.push({ role: 'assistant', content: final.content }, { role: 'user', content: results });
          stream = ask(RESULTS_EFFORT);
          events = stream[Symbol.asyncIterator]();
          first = await events.next();
        }
        if (stopReason === 'refusal') send(answer ? '\n\n(The answer stopped here.)' : "Sorry, I can't help with that one.");
        else if (stopReason === 'max_tokens') send('\n\n(The answer was cut short. Ask for the rest if you need it.)');
        await logSupportChat({
          conversationId,
          userId: access.userId,
          page,
          question,
          answer,
          stopReason,
        });
      } catch (err) {
        if (!cancelled && !stream.aborted) send(`\n\n(${apiErrorMessage(err)})`);
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
      cancelled = true;
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
