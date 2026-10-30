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

// Standard-mode Muse Spark (no "-contributor" suffix) bills at the
// higher Standard rates, the same table as the Modal Shared Endpoint.
export function isStandardMuse(model: string | undefined): boolean {
  return model !== undefined && model.startsWith("muse-") && !model.endsWith("-contributor");
}

export function metaCostUsd(input: { prompt: number; cached: number; completion: number }, model?: string): number {
  if (isStandardMuse(model)) return modalCostUsd(input);
  const fresh = Math.max(0, input.prompt - input.cached);
  return (
    (fresh / 1_000_000) * PRICES.metaInputPer1M +
    (input.cached / 1_000_000) * PRICES.metaCachedPer1M +
    (input.completion / 1_000_000) * PRICES.metaOutputPer1M
  );
}

// Muse Spark Open on a Modal Shared Endpoint (per-token, scales to zero).
export const MODAL_PRICES = {
  modalInputPer1M: 1.25,
  modalCachedPer1M: 0.15,
  modalOutputPer1M: 4.25,
} as const;

export function modalCostUsd(input: { prompt: number; cached: number; completion: number }): number {
  const fresh = Math.max(0, input.prompt - input.cached);
  return (
    (fresh / 1_000_000) * MODAL_PRICES.modalInputPer1M +
    (input.cached / 1_000_000) * MODAL_PRICES.modalCachedPer1M +
    (input.completion / 1_000_000) * MODAL_PRICES.modalOutputPer1M
  );
}

// Open-weights models served by Modal ship as meta-models/*.
export function costUsdFor(model: string, input: { prompt: number; cached: number; completion: number }): number {
  if (model.startsWith("meta-models/")) return modalCostUsd(input);
  return metaCostUsd(input, model);
}
