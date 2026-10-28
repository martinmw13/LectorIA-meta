// Shared narration cache flow: key -> index -> store -> lock -> budget
// -> synthesize -> put -> index. Used offline for Oz now and on demand
// for uploaded books later. Pure: every side effect arrives via deps.
import {
  NARRATION_FORMAT,
  NARRATION_MODEL,
  NARRATION_SPEED,
  NARRATION_VOICE,
  alignWords,
  estimateNarrationMicro,
  narrationKey,
  narrationKeyInput,
  parseChapterNarration,
} from "./narration";
import type { ChapterNarration, NarrationChunk } from "./narration";

export interface NarrationDeps {
  sha256Hex(text: string): Promise<string>;
  index: {
    get(key: string): Promise<ChapterNarration | null>;
    set(key: string, value: ChapterNarration): Promise<void>;
  };
  store: {
    getManifest(key: string): Promise<ChapterNarration | null>;
    putAudio(key: string, mp3: Uint8Array): Promise<string>;
    putManifest(key: string, value: ChapterNarration): Promise<void>;
  };
  lock?: {
    acquire(key: string): Promise<string | null>;
    release(key: string, token: string): Promise<void>;
  };
  budget?: {
    reserve(micro: number): Promise<boolean>;
    refund(micro: number): Promise<void>;
  };
  synthesize(req: {
    texts: string[];
    gaps: number[];
    voice: string;
    speed: number;
  }): Promise<{
    mp3: Uint8Array;
    durationSec: number;
    spans: { t0: number; t1: number; words: [string, number, number][] }[];
    gpuSec: number;
  }>;
}

export type EnsureResult =
  | { status: "ready"; narration: ChapterNarration; cached: boolean; costMicro: number }
  | { status: "pending" }
  | { status: "error"; code: "budget" | "failed" };

export async function ensureChapterNarration(
  input: { chunks: NarrationChunk[]; gaps: number[]; voice?: string; speed?: number },
  deps: NarrationDeps,
): Promise<EnsureResult> {
  const voice = input.voice ?? NARRATION_VOICE;
  const speed = input.speed ?? NARRATION_SPEED;
  const hash = await deps.sha256Hex(
    narrationKeyInput({ chunks: input.chunks, voice, model: NARRATION_MODEL, speed, format: NARRATION_FORMAT }),
  );
  const key = narrationKey(hash, voice);

  const indexed = await deps.index.get(key);
  if (indexed) return { status: "ready", narration: indexed, cached: true, costMicro: 0 };

  const stored = await deps.store.getManifest(key);
  if (stored) {
    await deps.index.set(key, stored);
    return { status: "ready", narration: stored, cached: true, costMicro: 0 };
  }

  let lease: string | null = null;
  if (deps.lock) {
    lease = await deps.lock.acquire(key);
    if (lease === null) return { status: "pending" };
    // Another holder may have just finished while we waited.
    const raced = await deps.index.get(key);
    if (raced) {
      await releaseQuietly(deps, key, lease);
      return { status: "ready", narration: raced, cached: true, costMicro: 0 };
    }
  }

  const release = async (): Promise<void> => {
    if (deps.lock && lease !== null) await releaseQuietly(deps, key, lease);
  };

  const totalChars = input.chunks.reduce((sum, c) => sum + c.text.length, 0);
  const estimate = estimateNarrationMicro(totalChars);
  if (deps.budget) {
    const ok = await deps.budget.reserve(estimate);
    if (!ok) {
      await release();
      return { status: "error", code: "budget" };
    }
  }

  let refunded = false;
  const refundOnce = async (): Promise<void> => {
    if (deps.budget && !refunded) {
      refunded = true;
      try {
        await deps.budget.refund(estimate);
      } catch {
        // The cap is advisory; a lost refund only skews accounting.
      }
    }
  };

  try {
    const out = await deps.synthesize({ texts: input.chunks.map((c) => c.text), gaps: input.gaps, voice, speed });
    if (out.spans.length !== input.chunks.length) throw new Error("span count mismatch");
    const src = await deps.store.putAudio(key, out.mp3);
    const manifest = parseChapterNarration({
      format: NARRATION_FORMAT,
      key,
      src,
      durationSec: out.durationSec,
      voice,
      model: NARRATION_MODEL,
      speed,
      chunks: input.chunks.map((chunk, i) => {
        const span = out.spans[i] as { t0: number; t1: number; words: [string, number, number][] };
        // alignWords returns offsets into the chunk text; the manifest
        // holds paragraph-relative offsets, so the chunk start is added.
        const w: number[] = [];
        for (const [start, end, t0, t1] of alignWords(
          chunk.text,
          span.words.map(([text, wt0, wt1]) => ({ text, t0: wt0, t1: wt1 })),
          span,
        )) {
          w.push(chunk.start + start, chunk.start + end, t0, t1);
        }
        return { n: chunk.n, start: chunk.start, end: chunk.end, t0: span.t0, t1: span.t1, w };
      }),
    });
    await deps.store.putManifest(key, manifest);
    await deps.index.set(key, manifest);
    await release();
    // The cap counts what was reserved; never refund on success.
    return { status: "ready", narration: manifest, cached: false, costMicro: estimate };
  } catch {
    await refundOnce();
    await release();
    return { status: "error", code: "failed" };
  }
}

async function releaseQuietly(deps: NarrationDeps, key: string, token: string): Promise<void> {
  try {
    await deps.lock?.release(key, token);
  } catch {
    // The lock has a TTL; a lost release expires on its own.
  }
}
