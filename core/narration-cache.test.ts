import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { activeChunkAt, chapterChunks, narrationKey, narrationKeyInput, sceneSpan } from "./narration";
import { ensureChapterNarration } from "./narration-cache";
import type { NarrationDeps } from "./narration-cache";
import { NARRATION_FORMAT, NARRATION_MODEL, NARRATION_SPEED, NARRATION_VOICE } from "./narration";
import type { ChapterNarration, NarrationChunk } from "./narration";

const PARAS = [
  { n: 1, text: `The road was long and dusty. Dorothy walked on bravely.` },
  { n: 2, text: `Toto barked at the strange green light ahead.` },
];

function built(): { chunks: NarrationChunk[]; gaps: number[] } {
  return chapterChunks(PARAS);
}

function keyFor(chunks: NarrationChunk[]): string {
  const input = narrationKeyInput({ chunks, voice: NARRATION_VOICE, model: NARRATION_MODEL, speed: NARRATION_SPEED, format: NARRATION_FORMAT });
  return narrationKey(createHash("sha256").update(input).digest("hex"), NARRATION_VOICE);
}

// In-memory fakes: index + store maps, a manual lock, a capped budget,
// and a synthesize stub the test drives per case.
function fakes(opts?: {
  synthesize?: NarrationDeps["synthesize"];
  budgetCapMicro?: number;
  lockHolds?: { held: string | null };
}): NarrationDeps & {
  indexMap: Map<string, ChapterNarration>;
  storeMap: Map<string, ChapterNarration>;
  audioMap: Map<string, Uint8Array>;
  synthCalls: number;
  refundCalls: number;
  releaseCalls: number;
} {
  const indexMap = new Map<string, ChapterNarration>();
  const storeMap = new Map<string, ChapterNarration>();
  const audioMap = new Map<string, Uint8Array>();
  let synthCalls = 0;
  let refundCalls = 0;
  let releaseCalls = 0;
  let reserved = 0;
  const held = opts?.lockHolds ?? { held: null as string | null };
  const synthesize: NarrationDeps["synthesize"] =
    opts?.synthesize ??
    (async ({ texts, gaps }) => ({
      mp3: new Uint8Array([1, 2, 3]),
      durationSec: texts.length * 2 + gaps.reduce((a, b) => a + b, 0),
      spans: texts.map((_, i) => ({ t0: i * 2, t1: i * 2 + 1.5, words: [] as [string, number, number][] })),
      gpuSec: 7.1,
    }));
  return {
    indexMap,
    storeMap,
    audioMap,
    get synthCalls() {
      return synthCalls;
    },
    get refundCalls() {
      return refundCalls;
    },
    get releaseCalls() {
      return releaseCalls;
    },
    sha256Hex: async (text: string) => createHash("sha256").update(text).digest("hex"),
    index: {
      get: async (key: string) => indexMap.get(key) ?? null,
      set: async (key: string, value: ChapterNarration) => {
        indexMap.set(key, value);
      },
    },
    store: {
      getManifest: async (key: string) => storeMap.get(key) ?? null,
      putAudio: async (key: string, mp3: Uint8Array) => {
        audioMap.set(key, mp3);
        return `https://blob.example.com/${key}.mp3`;
      },
      putManifest: async (key: string, value: ChapterNarration) => {
        storeMap.set(key, value);
      },
    },
    lock: {
      acquire: async () => {
        if (held.held !== null) return null;
        held.held = "token-1";
        return held.held;
      },
      release: async (_key: string, _token: string) => {
        releaseCalls += 1;
        held.held = null;
      },
    },
    budget: {
      reserve: async (micro: number) => {
        if (opts?.budgetCapMicro !== undefined && reserved + micro > opts.budgetCapMicro) return false;
        reserved += micro;
        return true;
      },
      refund: async (micro: number) => {
        refundCalls += 1;
        reserved -= micro;
      },
    },
    synthesize: async (req) => {
      synthCalls += 1;
      return synthesize(req);
    },
  };
}

describe("ensureChapterNarration", () => {
  it("hits from the index with no lock, budget, or synth cost", async () => {
    const deps = fakes();
    const { chunks, gaps } = built();
    const first = await ensureChapterNarration({ chunks, gaps }, deps);
    if (first.status !== "ready" || first.cached) throw new Error("first run should generate");
    const before = deps.synthCalls;
    const second = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(second).toMatchObject({ status: "ready", cached: true, costMicro: 0 });
    expect(deps.synthCalls).toBe(before);
  });

  it("backfills the index on a store hit and spends nothing", async () => {
    const deps = fakes();
    const { chunks, gaps } = built();
    const key = keyFor(chunks);
    const manifest: ChapterNarration = {
      format: 2,
      key,
      src: `https://blob.example.com/${key}.mp3`,
      durationSec: 10,
      voice: NARRATION_VOICE,
      model: NARRATION_MODEL,
      speed: NARRATION_SPEED,
      chunks: [
        { n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 0.5, 3.5] },
        { n: 2, start: 0, end: 7, t0: 4.3, t1: 9, w: [0, 7, 4.5, 8.5] },
      ],
    };
    deps.storeMap.set(key, manifest);
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toMatchObject({ status: "ready", cached: true, costMicro: 0 });
    expect(deps.indexMap.get(key)).toEqual(manifest);
    expect(deps.synthCalls).toBe(0);
  });

  it("reports pending for a concurrent caller while the lock is held", async () => {
    const held = { held: "other-token" };
    const deps = fakes({ lockHolds: held });
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toEqual({ status: "pending" });
    expect(deps.synthCalls).toBe(0);
  });

  it("releases the lock and never synthesizes on budget refusal", async () => {
    const deps = fakes({ budgetCapMicro: 1 });
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toEqual({ status: "error", code: "budget" });
    expect(deps.synthCalls).toBe(0);
    expect(deps.releaseCalls).toBe(1);
  });

  it("refunds exactly once and releases on synthesize failure", async () => {
    const deps = fakes({
      synthesize: async () => {
        throw new Error("modal down");
      },
    });
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toEqual({ status: "error", code: "failed" });
    expect(deps.refundCalls).toBe(1);
    expect(deps.releaseCalls).toBe(1);
  });

  it("refunds exactly once and releases on store failure", async () => {
    const deps = fakes();
    deps.store.putAudio = async () => {
      throw new Error("blob down");
    };
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toEqual({ status: "error", code: "failed" });
    expect(deps.refundCalls).toBe(1);
    expect(deps.releaseCalls).toBe(1);
  });

  it("fails on a span count mismatch without putting audio", async () => {
    const deps = fakes({
      synthesize: async ({ texts }) => ({
        mp3: new Uint8Array([9]),
        durationSec: 5,
        spans: texts.slice(0, -1).map((_, i) => ({ t0: i, t1: i + 0.5, words: [] as [string, number, number][] })),
        gpuSec: 1,
      }),
    });
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out).toEqual({ status: "error", code: "failed" });
    expect(deps.audioMap.size).toBe(0);
    expect(deps.refundCalls).toBe(1);
  });

  it("counts the estimate on success and round-trips timings", async () => {
    const deps = fakes();
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    if (out.status !== "ready" || out.cached) throw new Error("expected a generated ready");
    expect(out.costMicro).toBeGreaterThan(0);
    expect(deps.refundCalls).toBe(0);
    // Manifest timings drive the reader: scene seeks and highlight agree.
    expect(sceneSpan(out.narration, 1, 1)).toEqual({ startSec: 0, endSec: 3.5 });
    expect(sceneSpan(out.narration, 9, 9)).toBeNull();
    expect(activeChunkAt(out.narration.chunks, 2.1)).toBe(1);
    expect(activeChunkAt(out.narration.chunks, -1)).toBe(-1);
    // A second call after success is a free hit.
    const again = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(again).toMatchObject({ status: "ready", cached: true, costMicro: 0 });
  });

  it("builds paragraph-relative word timings from span words", async () => {
    const deps = fakes({
      synthesize: async ({ texts }) => ({
        mp3: new Uint8Array([1]),
        durationSec: 4,
        spans: texts.map(() => ({
          t0: 0,
          t1: 3.5,
          words: [
            ["hi", 0.5, 1.5],
            ["there", 1.5, 3],
          ] as [string, number, number][],
        })),
        gpuSec: 1,
      }),
    });
    const out = await ensureChapterNarration({ chunks: [{ n: 1, start: 0, end: 8, text: "hi there" }], gaps: [0] }, deps);
    if (out.status !== "ready") throw new Error("expected a generated ready");
    expect(out.narration.chunks[0]?.w).toEqual([0, 2, 0.5, 1.5, 3, 8, 1.5, 3]);
  });

  it("swallows release failures", async () => {
    const deps = fakes();
    deps.lock!.release = async () => {
      throw new Error("redis down");
    };
    const { chunks, gaps } = built();
    const out = await ensureChapterNarration({ chunks, gaps }, deps);
    expect(out.status).toBe("ready");
  });
});
