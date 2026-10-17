// List prices in US dollars per million tokens, from Anthropic's model table. Batch
// discounts are not used by this app, so they are not modelled. Prompt caching is
// (the support chat): a cache read has its own price, and a cache write costs 1.25×
// the input price (the 5-minute cache). The Anthropic Console is the authoritative bill.
export type ModelPrice = { input: number; output: number; cacheRead: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
};

// What writing to the 5-minute cache costs, as a multiple of the input price.
const CACHE_WRITE_FACTOR = 1.25;

// null when the model's price isn't known: better no number than a guessed one.
// `inputTokens` are the uncached ones (the API reports cached tokens separately).
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (
    (inputTokens * price.input +
      outputTokens * price.output +
      cacheReadTokens * price.cacheRead +
      cacheWriteTokens * price.input * CACHE_WRITE_FACTOR) /
    1_000_000
  );
}

// "$0.0264" under a dollar (these calls cost cents), "$12.40" above.
export function formatUsd(amount: number | null): string {
  if (amount === null) return 'price unknown';
  return amount < 1 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}
