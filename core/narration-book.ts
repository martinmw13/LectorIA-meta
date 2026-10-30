// Per-book narration manifest parsing (legacy flat Oz file and per-voice).
import { DEFAULT_NARRATION_VOICE } from "./narration-voices";
import { parseChapterNarration } from "./narration";
import type { ChapterNarration } from "./narration";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Per-book narration file: one chapter map per voice. The legacy shape
// (flat chapter numbers, Oz af_heart only) parses into the default
// voice so existing audio keeps working without regeneration.
export interface BookNarrationFile {
  textVersion: string;
  inputs: Record<string, string | null>;
  chaptersByVoice: Record<string, Record<string, ChapterNarration>>;
}

const VOICE_KEY_RE = /^[a-z]{2}_[a-z]+$/;

function parseChapterMap(value: unknown): Record<string, ChapterNarration> {
  if (!isRecord(value)) throw new Error("invalid narration file");
  const out: Record<string, ChapterNarration> = {};
  for (const [ch, entry] of Object.entries(value)) {
    if (!/^\d+$/.test(ch)) throw new Error("invalid narration file");
    out[ch] = parseChapterNarration(entry);
  }
  return out;
}

export function parseBookNarration(json: unknown): BookNarrationFile {
  if (!isRecord(json)) throw new Error("invalid narration file");
  if (typeof json.textVersion !== "string" || json.textVersion.length === 0) {
    throw new Error("invalid narration file");
  }
  if (!isRecord(json.chapters)) throw new Error("invalid narration file");
  const chaptersByVoice: Record<string, Record<string, ChapterNarration>> = {};
  const keys = Object.keys(json.chapters);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    const flat = parseChapterMap(json.chapters);
    for (const [ch, manifest] of Object.entries(flat)) {
      const voice = manifest.voice || DEFAULT_NARRATION_VOICE;
      (chaptersByVoice[voice] ??= {})[ch] = manifest;
    }
  } else {
    for (const [voice, chapters] of Object.entries(json.chapters)) {
      if (!VOICE_KEY_RE.test(voice)) throw new Error("invalid narration file");
      chaptersByVoice[voice] = parseChapterMap(chapters);
    }
  }
  const inputs: Record<string, string | null> = {};
  const provenance = isRecord(json.provenance) ? json.provenance : {};
  if (isRecord(provenance.inputs)) {
    for (const [voice, input] of Object.entries(provenance.inputs)) {
      if (input === null) inputs[voice] = null;
      else if (typeof input === "string") inputs[voice] = input;
    }
  } else if (typeof provenance.input === "string") {
    const voice = typeof provenance.voice === "string" ? provenance.voice : DEFAULT_NARRATION_VOICE;
    inputs[voice] = provenance.input;
  }
  return { textVersion: json.textVersion, inputs, chaptersByVoice };
}

