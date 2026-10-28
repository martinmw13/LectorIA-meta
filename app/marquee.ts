// Marquee timing for the fixed-width player title slot.
export function marqueeDurationMs(shiftPx: number): number {
  if (!Number.isFinite(shiftPx) || shiftPx <= 0) return 6000;
  // 30 px/s for the moving part, plus ~2 s of end pauses, min 6 s.
  return Math.max(6000, Math.round((shiftPx / 30) * 1000 + 2000));
}
