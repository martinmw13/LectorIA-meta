// Music duck while the voice plays: the music sits about 20 dB below
// the voice, ramped down over ~400 ms and back up over ~800 ms so the
// dip never clicks.
export const NARRATION_DUCK_DB = 20;
export const NARRATION_DUCK_DOWN_MS = 400;
export const NARRATION_DUCK_UP_MS = 800;

// Effective music level while narration plays: min(music, voice * gain
// for -duckDb). The Player keeps applying it through its duck
// multiplier, so the multiplier is effective / music. Pure, so the
// controller and the tests share the curve.
export function duckMultiplier(musicLevel: number, voiceVolume: number, duckDb = NARRATION_DUCK_DB): number {
  if (!(musicLevel > 0)) return 1;
  if (!Number.isFinite(voiceVolume) || voiceVolume < 0) return 1;
  return Math.min(1, (voiceVolume * 10 ** (-duckDb / 20)) / musicLevel);
}

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
