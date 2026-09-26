import { MODEL_PRICES, formatUsd } from '@/lib/claude-pricing';
import { CLAUDE_MODEL, CLAUDE_PROMPTS } from '@/lib/claude-prompts';
import type { ClaudeUsage, UsageTotals } from '@/lib/claude-usage';

const number = (n: number) => n.toLocaleString('en-US');
const when = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;
const OUTCOME: Record<string, string> = { end_turn: 'ok', refusal: 'refused', max_tokens: 'cut off' };

const promptName = (id: string) => CLAUDE_PROMPTS.find((p) => p.id === id)?.name ?? id;

function Totals({ label, totals }: { label: string; totals: UsageTotals }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{formatUsd(totals.cost)}</div>
      <div className="text-xs text-gray-500">
        {number(totals.calls)} call{totals.calls === 1 ? '' : 's'} · {number(totals.inputTokens)} in · {number(totals.outputTokens)} out
      </div>
      {totals.unpriced > 0 && <div className="text-xs text-amber-700">{totals.unpriced} call(s) on a model with no known price are not in this cost.</div>}
    </div>
  );
}

// Everything about the app's use of Claude, apart from the key form itself (passed in):
// what the calls have cost, every prompt that is sent, and the recent calls.
export function ClaudeSection({ keyForm, usage }: { keyForm: React.ReactNode; usage: ClaudeUsage }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Claude integration</h2>
      {keyForm}

      <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <div className="font-medium">Usage and cost</div>
        {!usage.available ? (
          <p className="text-sm text-amber-700">
            This database has no usage log yet. Add it with the <code>claude_usage</code> table in <code>backend/schema.sql</code> (on the local
            database, Head Judge → database button → Set up tables).
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Totals label="This month" totals={usage.month} />
              <Totals label="Last 30 days" totals={usage.last30Days} />
              <Totals label="All time" totals={usage.allTime} />
            </div>
            <p className="text-xs text-gray-500">
              {usage.firstCallAt
                ? `Counted since the first logged call, ${when(new Date(usage.firstCallAt).toISOString())}; earlier calls are not included.`
                : 'No calls logged yet: the first time someone uses Fill from Claude or Parse with Claude it shows up here.'}{' '}
              Cost is worked out from each call&apos;s token counts at the list prices below (no discounts), so it is an estimate: the Anthropic
              Console has the actual bill. Calls made while the server runs on the local database are logged in that database only.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <div className="font-medium">Prompts ({CLAUDE_PROMPTS.length})</div>
        <p className="text-xs text-gray-500">
          Every prompt the app sends. Each call is one system prompt (below) and one user message, which is always the text the person pasted.
          These are read from the same place the calls are made from, so this is exactly what is sent.
        </p>
        {CLAUDE_PROMPTS.map((prompt) => {
          const month = usage.byFeature[prompt.id]?.month;
          const all = usage.byFeature[prompt.id]?.allTime;
          return (
            <div key={prompt.id} className="flex flex-col gap-2 rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium">{prompt.name}</div>
                <div className="text-xs text-gray-500">
                  {usage.available && all
                    ? `${number(all.calls)} call${all.calls === 1 ? '' : 's'}, ${formatUsd(all.cost)} all time · ${formatUsd(month?.cost ?? 0)} this month`
                    : usage.available
                      ? 'not used yet'
                      : ''}
                </div>
              </div>
              <p className="text-xs text-gray-600">Used in: {prompt.usedIn}</p>
              <p className="text-xs text-gray-600">Returns: {prompt.outputSummary}</p>
              <p className="text-xs text-gray-500">
                Model {prompt.model} · effort {prompt.effort} · up to {number(prompt.maxTokens)} output tokens
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-blue-600">Show the system prompt</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{prompt.system}</pre>
              </details>
            </div>
          );
        })}
      </div>

      {usage.available && (
        <div className="flex flex-col gap-2 rounded border border-gray-300 p-3">
          <div className="font-medium">Recent calls</div>
          {usage.recent.length === 0 ? (
            <p className="text-sm text-gray-500">None yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-1 pr-3 font-normal">When</th>
                    <th className="py-1 pr-3 font-normal">Prompt</th>
                    <th className="py-1 pr-3 font-normal">By</th>
                    <th className="py-1 pr-3 text-right font-normal">In</th>
                    <th className="py-1 pr-3 text-right font-normal">Out</th>
                    <th className="py-1 pr-3 text-right font-normal">Cost</th>
                    <th className="py-1 font-normal">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.recent.map((call, i) => (
                    <tr key={i} className="border-b border-gray-100 align-top">
                      <td className="whitespace-nowrap py-1 pr-3">{when(call.at)}</td>
                      <td className="py-1 pr-3">{promptName(call.feature)}</td>
                      <td className="py-1 pr-3">{call.email ?? '—'}</td>
                      <td className="py-1 pr-3 text-right">{number(call.inputTokens)}</td>
                      <td className="py-1 pr-3 text-right">{number(call.outputTokens)}</td>
                      <td className="py-1 pr-3 text-right">{formatUsd(call.cost)}</td>
                      <td className={`py-1 ${call.stopReason && call.stopReason !== 'end_turn' ? 'text-amber-700' : ''}`}>
                        {call.stopReason ? (OUTCOME[call.stopReason] ?? call.stopReason) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded border border-gray-300 p-3">
        <div className="font-medium">Prices used (US dollars per million tokens)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-3 font-normal">Model</th>
                <th className="py-1 pr-3 text-right font-normal">Input</th>
                <th className="py-1 text-right font-normal">Output</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(MODEL_PRICES).map(([model, price]) => (
                <tr key={model} className="border-b border-gray-100">
                  <td className="py-1 pr-3">
                    {model}
                    {model === CLAUDE_MODEL && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-800">in use</span>}
                  </td>
                  <td className="py-1 pr-3 text-right">${price.input}</td>
                  <td className="py-1 text-right">${price.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
