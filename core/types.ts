// Shared shapes for the book pipeline. Every type stored in data files
// lives here so core never imports from pipeline.
export const EMOTIONS = [
  "calma",
  "alegria",
  "tristeza",
  "suspenso",
  "misterio",
  "aventura",
  "combate",
  "asombro",
] as const;

export type EmotionId = (typeof EMOTIONS)[number];
export type JevEmotionId = EmotionId | "unknown";

export interface Book {
  id: string;
  title: string;
  author: string;
  source: { gutenberg: number; url: string };
  textVersion: string;
  chapters: Chapter[];
  paragraphs: Paragraph[];
}

export interface Chapter {
  ch: number;
  title: string;
  start_n: number;
  end_n: number;
}

export interface Paragraph {
  id: string;
  ch: number;
  n: number;
  text: string;
}

export interface SceneInput {
  start_n: number;
  end_n: number;
  title: string;
  summary: string;
  characters: string[];
}

export interface Scene extends SceneInput {
  id: string;
  ch: number;
}

export type Vector8 = Record<EmotionId, number>;
export type Vector9 = Record<JevEmotionId, number>;

// Jev classification of one scene. A hard failure leaves this null and
// stores no vector, so the scene keeps the previous track.
export interface JevResult {
  vector: Vector9;
  choice: JevEmotionId;
  confidence: number;
  intensity: number;
  intensity_confidence: number;
  tempo: number;
  tempo_confidence: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface OverrideResult {
  vector: Vector8;
  reason: string;
  model: string;
}

export interface SceneEmotion {
  jev: JevResult | null;
  muse_override: OverrideResult | null;
  final: { vector: Vector8; intensity: number; tempo: number } | null;
  error: string | null;
}

export type AnalyzedScene = Scene & SceneEmotion;

export const LOW_CONFIDENCE = 0.6;
export const FEATURE_WEIGHTS = { intensity: 0.5, tempo: 0.5 } as const;

// Image API contract. Request names the selection by paragraph ordinals;
// the response is a Blob URL, never bytes. No routes yet.
export interface ImageRequest {
  bookId: string;
  textVersion: string;
  firstN: number;
  lastN: number;
}

export interface ImageResponse {
  url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// Chat API contract. Server builds context from the book text up to
// positionN (whole book when spoilerMode), prefix first, question last.
export interface ChatRequest {
  bookId: string;
  textVersion: string;
  positionN: number;
  spoilerMode: boolean;
  messages: ChatMessage[];
}
