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

// Target text-page index for the follow loop, or null to stay. The
// lookup runs in text-page space (the cover shifts sub-pages by one,
// which scene-page adds back in onTurnPage), and a recent manual move
// holds the turn without stopping the voice.
export function autoTurnTarget(
  pages: { paragraphs: { n: number }[] }[],
  chunkN: number,
  textPage: number,
  lastManualAtMs: number | null,
  nowMs: number,
): number | null {
  const at = pages.findIndex((pg) => pg.paragraphs.some((p) => p.n === chunkN));
  if (at < 0 || at === textPage) return null;
  return shouldAutoTurn(lastManualAtMs, nowMs) ? at : null;
}
