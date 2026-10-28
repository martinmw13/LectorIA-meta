// Ducks while the voice plays. Both are multipliers on the user's own
// slider level, so a duck can only lower a source, never raise it, and
// never starts or stops one: paused music and rain that is off stay so.
export const MUSIC_DUCK_DB = 11;
export const AMBIENCE_DUCK_DB = 6;
export const NARRATION_DUCK_DOWN_MS = 300;
export const NARRATION_DUCK_UP_MS = 300;

export function duckTarget(narrating: boolean, duckDb: number): number {
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
