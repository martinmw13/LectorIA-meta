// Kokoro client for the offline pipeline: calls the deployed
// lectoria-narration/narrate Modal function. The Modal SDK reads
// MODAL_TOKEN_ID / MODAL_TOKEN_SECRET from env itself; this module
// never reads, logs, or passes them. Errors are short and generic.
import { ModalClient } from "modal";

export interface KokoroSynthResult {
  mp3: Uint8Array;
  durationSec: number;
  spans: { t0: number; t1: number; words: [string, number, number][] }[];
  gpuSec: number;
}

export interface KokoroClient {
  synthesize(req: { texts: string[]; gaps: number[]; voice: string; speed: number }): Promise<KokoroSynthResult>;
}

function validShape(value: unknown, texts: number): value is KokoroSynthResult {
  if (typeof value !== "object" || value === null) return false;
  const out = value as Record<string, unknown>;
  const mp3 = out.mp3;
  if (!(mp3 instanceof Uint8Array) && !Buffer.isBuffer(mp3)) return false;
  if (typeof out.durationSec !== "number" || !Number.isFinite(out.durationSec)) return false;
  if (typeof out.gpuSec !== "number" || !Number.isFinite(out.gpuSec)) return false;
  if (!Array.isArray(out.spans) || out.spans.length !== texts) return false;
  return out.spans.every((span) => {
    if (typeof span !== "object" || span === null) return false;
    const words = (span as { words: unknown }).words;
    if (!Array.isArray(words)) return false;
    for (const entry of words) {
      if (!Array.isArray(entry) || entry.length !== 3) return false;
      const [text, t0, t1] = entry as unknown[];
      if (typeof text !== "string") return false;
      if (typeof t0 !== "number" || !Number.isFinite(t0)) return false;
      if (typeof t1 !== "number" || !Number.isFinite(t1)) return false;
    }
    return (
      typeof (span as { t0: unknown }).t0 === "number" &&
      Number.isFinite((span as { t0: number }).t0) &&
      typeof (span as { t1: unknown }).t1 === "number" &&
      Number.isFinite((span as { t1: number }).t1)
    );
  });
}

export function createKokoroClient(): KokoroClient {
  return {
    synthesize: async ({ texts, gaps, voice, speed }) => {
      const modal = new ModalClient();
      const fn = await modal.functions.fromName("lectoria-narration", "narrate");
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const out = await fn.remote([], { texts, gaps, voice, speed });
          if (!validShape(out, texts.length)) throw new Error("narration synthesize failed");
          return { mp3: new Uint8Array(out.mp3), durationSec: out.durationSec, spans: out.spans, gpuSec: out.gpuSec };
        } catch {
          // SDK errors stay here; callers and logs see only the generic message.
        }
      }
      throw new Error("narration synthesize failed");
    },
  };
}
