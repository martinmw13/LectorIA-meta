// Read-aloud voices shared by the client, the server, and the pipeline.
import { NARRATION_VOICE } from "./narration-constants";

export const DEFAULT_NARRATION_VOICE = NARRATION_VOICE;


// The two read-aloud voices (owner decision: Heart and Michael only), shared by the client, the server, and
// the pipeline. Kokoro lang codes follow the voice prefix: American
// voices (af_, am_) use "a", British voices (bf_, bm_) use "b".
export interface NarrationVoice {
  id: string;
  label: string;
}

export const NARRATION_VOICES: NarrationVoice[] = [
  { id: "af_heart", label: "Heart" },
  { id: "am_michael", label: "Michael" },
];

export function isNarrationVoiceId(value: unknown): value is string {
  return typeof value === "string" && NARRATION_VOICES.some((v) => v.id === value);
}

// Kokoro lang code for a voice id: "b" for British (bf_, bm_)
// voices, "a" for American ones.
export function kokoroLangCode(voiceId: string): "a" | "b" {
  return voiceId.startsWith("b") ? "b" : "a";
}

export function narrationVoiceLabel(voiceId: string): string {
  return NARRATION_VOICES.find((v) => v.id === voiceId)?.label ?? voiceId;
}
