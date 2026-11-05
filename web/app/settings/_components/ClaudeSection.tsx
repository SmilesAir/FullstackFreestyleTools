import { MODEL_PRICES, formatUsd } from '@/lib/claude-pricing';
import { CLAUDE_MODEL, CLAUDE_PROMPTS } from '@/lib/claude-prompts';
import type { ClaudeUsage, UsageTotals } from '@/lib/claude-usage';
import { getT } from '@/lib/i18n/server';

const when = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

const promptName = (id: string) => CLAUDE_PROMPTS.find((p) => p.id === id)?.name ?? id;

async function Totals({ label, totals }: { label: string; totals: UsageTotals }) {
  const t = await getT();
  const number = (n: number) => n.toLocaleString(t.common.intlLocale);
  return (
    <div className="flex flex-col gap-0.5 rounded border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{formatUsd(totals.cost)}</div>
      <div className="text-xs text-gray-500">
        {t.admin.callsLine(number(totals.calls), totals.calls, number(totals.inputTokens), number(totals.outputTokens))}
      </div>
      {totals.unpriced > 0 && <div className="text-xs text-amber-700">{t.admin.unpriced(totals.unpriced)}</div>}
    </div>
  );
}

// Everything about the app's use of Claude, apart from the key form itself (passed in):
// what the calls have cost, every prompt that is sent, and the recent calls.
export async function ClaudeSection({ keyForm, usage }: { keyForm: React.ReactNode; usage: ClaudeUsage }) {
  const t = await getT();
  const number = (n: number) => n.toLocaleString(t.common.intlLocale);
  const OUTCOME: Record<string, string> = t.admin.outcome;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t.admin.claudeIntegration}</h2>
      {keyForm}

      <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <div className="font-medium">{t.admin.usageAndCost}</div>
        {!usage.available ? (
          <p className="text-sm text-amber-700">
            {t.admin.noUsageLog}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Totals label={t.admin.thisMonth} totals={usage.month} />
              <Totals label={t.admin.last30Days} totals={usage.last30Days} />
              <Totals label={t.admin.allTime} totals={usage.allTime} />
            </div>
            <p className="text-xs text-gray-500">
              {usage.firstCallAt
                ? t.admin.countedSince(when(new Date(usage.firstCallAt).toISOString()))
                : t.admin.noCallsYet}{' '}
              {t.admin.costNote}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded border border-gray-300 p-3">
        <div className="font-medium">{t.admin.prompts(CLAUDE_PROMPTS.length)}</div>
        <p className="text-xs text-gray-500">
          {t.admin.promptsHelp}
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
                    ? t.admin.promptUsage(number(all.calls), all.calls, formatUsd(all.cost), formatUsd(month?.cost ?? 0))
                    : usage.available
                      ? t.admin.notUsedYet
                      : ''}
                </div>
              </div>
              <p className="text-xs text-gray-600">{t.admin.usedIn(prompt.usedIn)}</p>
              <p className="text-xs text-gray-600">{t.admin.returns(prompt.outputSummary)}</p>
              <p className="text-xs text-gray-500">
                {t.admin.modelLine(prompt.model, prompt.effort, number(prompt.maxTokens))}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-blue-600">{t.admin.showPrompt}</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{prompt.system}</pre>
              </details>
            </div>
          );
        })}
      </div>

      {usage.available && (
        <div className="flex flex-col gap-2 rounded border border-gray-300 p-3">
          <div className="font-medium">{t.admin.recentCalls}</div>
          {usage.recent.length === 0 ? (
            <p className="text-sm text-gray-500">{t.admin.noneYet}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-1 pr-3 font-normal">{t.admin.when}</th>
                    <th className="py-1 pr-3 font-normal">{t.admin.prompt}</th>
                    <th className="py-1 pr-3 font-normal">{t.admin.by}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.admin.in}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.admin.out}</th>
                    <th className="py-1 pr-3 text-right font-normal">{t.admin.cost}</th>
                    <th className="py-1 font-normal">{t.admin.ended}</th>
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
        <div className="font-medium">{t.admin.prices}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1 pr-3 font-normal">{t.admin.model}</th>
                <th className="py-1 pr-3 text-right font-normal">{t.admin.input}</th>
                <th className="py-1 text-right font-normal">{t.admin.output}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(MODEL_PRICES).map(([model, price]) => (
                <tr key={model} className="border-b border-gray-100">
                  <td className="py-1 pr-3">
                    {model}
                    {model === CLAUDE_MODEL && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-800">{t.admin.inUse}</span>}
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
