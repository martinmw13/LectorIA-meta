// Auto page-turn gate: the voice follows the text across sub-pages and
// scenes on its own, unless the reader just moved by hand. A recent
// manual move means the voice keeps reading without yanking the page.
export const NARRATION_MANUAL_WINDOW_MS = 8000;

export function shouldAutoTurn(
  lastManualAtMs: number | null,
  nowMs: number,
  windowMs: number = NARRATION_MANUAL_WINDOW_MS,
): boolean {
  if (lastManualAtMs === null) return true;
  return nowMs - lastManualAtMs >= windowMs;
}
