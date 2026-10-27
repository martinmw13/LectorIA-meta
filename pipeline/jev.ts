// Jev emotion client. The state and questions builder lives here, not
// in core, so core stays free of API shapes.
import { EMOTIONS } from "../core/types";
import type { EmotionId, JevEmotionId, JevResult, Vector9 } from "../core/types";
import { fetchWithRetry } from "./http";

export type { JevResult };

export interface JevClient {
  model: string;
  classify(input: { book: string; chapter: string; sceneTitle: string; scene: string }): Promise<JevResult>;
}

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const SCORE_LEVELS = 5;

const EMOTION_DESCRIPTIONS: Record<EmotionId | "unknown", string> = {
  calma: "Calm, peaceful, safe at rest",
  alegria: "Joyful, warm, celebratory",
  tristeza: "Sad, mournful, grieving",
  suspenso: "Tense, expectant, danger near",
  misterio: "Mysterious, veiled, uncanny",
  aventura: "Adventurous, bold, on the road",
  combate: "Fierce, confrontational, fighting",
  asombro: "Awe struck, wonder filled",
  unknown: "None of the feelings above fits",
};

function buildQuestions(): Record<string, unknown> {
  const criteria: Record<string, string> = {};
  for (const id of [...EMOTIONS, "unknown"] as (EmotionId | "unknown")[]) criteria[id] = EMOTION_DESCRIPTIONS[id];
  return {
    emotion: {
      type: "choice",
      instructions: "Which feeling should the soundtrack carry for `scene`?",
      criteria,
    },
    intensity: {
      type: "score",
      instructions: "How strong is the emotional and dramatic intensity of `scene`?",
      criteria: ["very low", "low", "medium", "high", "very high"],
    },
    tempo: {
      type: "score",
      instructions: "How fast and urgent is the pace and energy of the action in `scene`?",
      criteria: ["very slow and still", "slow", "moderate", "fast", "very fast and urgent"],
    },
  };
}

// Scene openings and endings carry the mood shift, so keep both ends.
export function capSceneText(text: string, limit = 12000): string {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return `${text.slice(0, half)}\n[...]\n${text.slice(text.length - half)}`;
}

function normalizeScore(score: number): number {
  return Math.min(1, Math.max(0, score / (SCORE_LEVELS - 1)));
}

interface JevAnswer {
  choice?: unknown;
  confidence?: unknown;
  probabilities?: unknown;
  score?: unknown;
}

function parseJevResponse(payload: unknown, model: string): Omit<JevResult, "input_tokens" | "output_tokens"> & { input_tokens: number; output_tokens: number } {
  const root = payload as {
    answers?: Record<string, JevAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const emotion = root.answers?.emotion ?? {};
  const intensity = root.answers?.intensity ?? {};
  const tempo = root.answers?.tempo ?? {};
  const vector = {} as Vector9;
  const probs = (emotion.probabilities ?? {}) as Record<string, unknown>;
  for (const id of [...EMOTIONS, "unknown"] as JevEmotionId[]) {
    const value = probs[id];
    vector[id] = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return {
    vector,
    choice: typeof emotion.choice === "string" ? (emotion.choice as JevEmotionId) : "unknown",
    confidence: typeof emotion.confidence === "number" ? emotion.confidence : 0,
    intensity: normalizeScore(typeof intensity.score === "number" ? intensity.score : 0),
    intensity_confidence: typeof intensity.confidence === "number" ? intensity.confidence : 0,
    tempo: normalizeScore(typeof tempo.score === "number" ? tempo.score : 0),
    tempo_confidence: typeof tempo.confidence === "number" ? tempo.confidence : 0,
    model,
    input_tokens: root.usage?.input_tokens ?? 0,
    output_tokens: root.usage?.output_tokens ?? 0,
  };
}

export function createJevClient(input: { fetchFn?: typeof fetch; apiKey: string; model: string }): JevClient {
  const fetchFn = input.fetchFn ?? fetch;
  return {
    model: input.model,
    classify: async ({ book, chapter, sceneTitle, scene }) => {
      const body = JSON.stringify({
        model: input.model,
        state: { book, chapter, scene_title: sceneTitle, scene: capSceneText(scene) },
        questions: buildQuestions(),
      });
      const response = await fetchWithRetry(
        fetchFn,
        JEV_URL,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
          body,
        },
        { attempts: 3 },
      );
      return parseJevResponse(await response.json(), input.model);
    },
  };
}
