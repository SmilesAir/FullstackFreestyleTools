// List prices in US dollars per million tokens, from Anthropic's model table. Batch
// discounts and prompt caching are not used by this app, so they are not modelled.
// The Anthropic Console is the authoritative bill.
export type ModelPrice = { input: number; output: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-fable-5-1': { input: 10, output: 50 },
};

// null when the model's price isn't known: better no number than a guessed one.
export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// "$0.0264" under a dollar (these calls cost cents), "$12.40" above.
export function formatUsd(amount: number | null): string {
  if (amount === null) return 'price unknown';
  return amount < 1 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}
