// Kokoro client for the offline pipeline: calls the deployed
// lectoria-narration/narrate Modal function. The Modal SDK reads
// MODAL_TOKEN_ID / MODAL_TOKEN_SECRET from env itself; this module
// never reads, logs, or passes them. Errors are short and generic.
import { ModalClient } from "modal";

export interface KokoroSynthResult {
  mp3: Uint8Array;
  durationSec: number;
  spans: { t0: number; t1: number }[];
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
  return out.spans.every(
    (span) =>
      typeof span === "object" &&
      span !== null &&
      typeof (span as { t0: unknown }).t0 === "number" &&
      Number.isFinite((span as { t0: number }).t0) &&
      typeof (span as { t1: unknown }).t1 === "number" &&
      Number.isFinite((span as { t1: number }).t1),
  );
}

export function createKokoroClient(): KokoroClient {
  return {
    synthesize: async ({ texts, gaps, voice, speed }) => {
      const modal = new ModalClient();
      const fn = await modal.functions.fromName("lectoria-narration", "narrate");
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const out = await fn.remote([], { texts, gaps, voice, speed });
          if (!validShape(out, texts.length)) throw new Error("narration synthesize failed");
          return { mp3: new Uint8Array(out.mp3), durationSec: out.durationSec, spans: out.spans, gpuSec: out.gpuSec };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("narration synthesize failed");
    },
  };
}
