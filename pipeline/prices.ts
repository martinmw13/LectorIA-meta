// Model price table (USD per 1M tokens) and cost helpers. Cached Meta
// tokens are part of prompt_tokens and bill at the cached rate.
export const PRICES = {
  jevInputPer1M: 0.042,
  metaInputPer1M: 0.1,
  metaCachedPer1M: 0.002,
  metaOutputPer1M: 0.2,
} as const;

export function jevCostUsd(inputTokens: number): number {
  return (inputTokens / 1_000_000) * PRICES.jevInputPer1M;
}

export function metaCostUsd(input: { prompt: number; cached: number; completion: number }): number {
  const fresh = Math.max(0, input.prompt - input.cached);
  return (
    (fresh / 1_000_000) * PRICES.metaInputPer1M +
    (input.cached / 1_000_000) * PRICES.metaCachedPer1M +
    (input.completion / 1_000_000) * PRICES.metaOutputPer1M
  );
}
