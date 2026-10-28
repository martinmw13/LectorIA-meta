// Music duck while the voice plays: about -18 dB, ramped down over
// ~400 ms and back up over ~800 ms so the dip never clicks.
export const NARRATION_DUCK_DB = -18;
export const NARRATION_DUCK_DOWN_MS = 400;
export const NARRATION_DUCK_UP_MS = 800;

// 10^(-18/20): the music multiplier at full duck.
export const NARRATION_DUCK_LEVEL = 10 ** (NARRATION_DUCK_DB / 20);

// One ramp step toward target: an exponential approach that lands
// exactly when the elapsed slice covers the duration. Pure, so the
// controller and the tests share the curve.
export function rampDuck(current: number, target: number, dtMs: number, durationMs: number): number {
  if (!(dtMs > 0)) return current;
  if (!(durationMs > 0)) return target;
  const next = current + (target - current) * Math.min(1, dtMs / durationMs);
  // Snap when close so the ramp settles instead of easing forever.
  return Math.abs(next - target) < 1e-4 ? target : next;
}
