// Emotion decision logic: when Jev needs a Muse override, and how the
// final 8-emotion vector is assembled. Pure, no network.
import { EMOTIONS, LOW_CONFIDENCE } from "./types";
import type { EmotionId, JevEmotionId, SceneEmotion, Vector8 } from "./types";

export { LOW_CONFIDENCE };

export function needsOverride(input: {
  choice: JevEmotionId;
  confidence: number;
  probabilities: Partial<Record<JevEmotionId, number>>;
}): boolean {
  if (input.choice === "unknown") return true;
  if (input.confidence < LOW_CONFIDENCE) return true;
  let maxId: JevEmotionId = input.choice;
  let maxValue = -Infinity;
  for (const [id, value] of Object.entries(input.probabilities)) {
    if (typeof value === "number" && value > maxValue) {
      maxValue = value;
      maxId = id as JevEmotionId;
    }
  }
  return maxId === "unknown";
}

// Clamps negatives to 0, fills missing ids with 0, scales to sum 1.
// Returns null when the vector is all zero (a failure, never a guess).
export function renormalize8(vector: Partial<Record<EmotionId, number>>): Vector8 | null {
  const clamped = {} as Vector8;
  let sum = 0;
  for (const id of EMOTIONS) {
    const value = Math.max(0, vector[id] ?? 0);
    clamped[id] = value;
    sum += value;
  }
  if (sum <= 0) return null;
  for (const id of EMOTIONS) clamped[id] /= sum;
  return clamped;
}

// Direct Jev path: drop `unknown` and renormalize. Intensity and tempo
// always come from Jev, even after an override.
export function jevFinal(input: {
  probabilities: Partial<Record<JevEmotionId, number>>;
  intensity: number;
  tempo: number;
}): SceneEmotion["final"] {
  const { unknown: _dropped, ...rest } = input.probabilities;
  const vector = renormalize8(rest);
  if (vector === null) return null;
  return { vector, intensity: input.intensity, tempo: input.tempo };
}
