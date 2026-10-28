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

// Rain and ambience duck on their own: a flat ~20 dB cut while the
// voice plays, so a muted music track never leaves the rain at full
// level under the narration.
export function ambienceDuckTarget(narrating: boolean, duckDb = NARRATION_DUCK_DB): number {
  return narrating ? 10 ** (-duckDb / 20) : 1;
}

// One ramp step toward target: a linear slide of the multiplier (full
// 0..1 range per duration), so frame-by-frame steps land within the
// duration instead of easing for seconds. Pure, so the controller and
// the tests share the curve.
export function rampDuck(current: number, target: number, dtMs: number, durationMs: number): number {
  if (!(dtMs > 0)) return current;
  if (!(durationMs > 0)) return target;
  const step = Math.min(1, dtMs / durationMs);
  const diff = target - current;
  return Math.abs(diff) <= step ? target : current + Math.sign(diff) * step;
}
