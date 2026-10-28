import { describe, expect, it, vi } from "vitest";
import { createMemoryKV, dailySpendKey, spendKey } from "@/core/images";
import { NARRATION_FORMAT, NARRATION_MODEL, NARRATION_SPEED, NARRATION_VOICE } from "@/core/narration";
import type { ChapterNarration } from "@/core/narration";
import { createNarrationDeps } from "./cache";

const ENV = { spendCapMicro: 1_000_000, dailySpendCapMicro: 1_000_000 };

function manifest(key: string): ChapterNarration {
  return {
    format: 2,
    key,
    src: `https://blob.example.com/${key}.mp3`,
    durationSec: 10,
    voice: NARRATION_VOICE,
    model: NARRATION_MODEL,
    speed: NARRATION_SPEED,
    chunks: [{ n: 1, start: 0, end: 5, t0: 0, t1: 4, w: [0, 5, 1, 3] }],
  };
}

describe("narration server adapters", () => {
  it("round-trips the index and rejects corrupt entries", async () => {
    const kv = createMemoryKV();
    const deps = createNarrationDeps({ kv, env: ENV, synthesize: async () => { throw new Error("unused"); } });
    expect(await deps.index.get("narration/v1/x")).toBeNull();
    const value = manifest("narration/v1/x");
    await deps.index.set("narration/v1/x", value);
    expect(await deps.index.get("narration/v1/x")).toEqual(value);
    await kv.set("narr:idx:narration/v1/x", "{bad json");
    expect(await deps.index.get("narration/v1/x")).toBeNull();
  });

  it("hands the lock to one holder and frees it on release", async () => {
    const kv = createMemoryKV();
    const deps = createNarrationDeps({ kv, env: ENV, synthesize: async () => { throw new Error("unused"); } });
    const first = await deps.lock?.acquire("k");
    expect(typeof first).toBe("string");
    expect(await deps.lock?.acquire("k")).toBeNull();
    await deps.lock?.release("k", "wrong-token");
    expect(await deps.lock?.acquire("k")).toBeNull();
    await deps.lock?.release("k", first as string);
    expect(typeof (await deps.lock?.acquire("k"))).toBe("string");
  });

  it("reserves on both spend keys and refunds both past either cap", async () => {
    const kv = createMemoryKV();
    const deps = createNarrationDeps({ kv, env: ENV, synthesize: async () => { throw new Error("unused"); } });
    expect(await deps.budget?.reserve(100)).toBe(true);
    expect(await kv.get(spendKey())).toBe("100");
    const day = new Date().toISOString().slice(0, 10);
    expect(await kv.get(dailySpendKey(day))).toBe("100");
    await deps.budget?.refund(100);
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get(dailySpendKey(day))).toBe("0");

    const tight = createNarrationDeps({ kv, env: { spendCapMicro: 50, dailySpendCapMicro: 1_000_000 }, synthesize: async () => { throw new Error("unused"); } });
    expect(await tight.budget?.reserve(100)).toBe(false);
    expect(await kv.get(spendKey())).toBe("0");

    const dailyTight = createNarrationDeps({ kv, env: { spendCapMicro: 1_000_000, dailySpendCapMicro: 50 }, synthesize: async () => { throw new Error("unused"); } });
    expect(await dailyTight.budget?.reserve(100)).toBe(false);
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get(dailySpendKey(day))).toBe("0");
  });

  it("hashes with SHA-256", async () => {
    const kv = createMemoryKV();
    const deps = createNarrationDeps({ kv, env: ENV, synthesize: async () => { throw new Error("unused"); } });
    expect(await deps.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("keeps the manifest format at 2", () => {
    expect(NARRATION_FORMAT).toBe(2);
  });
  it("refunds the daily counter of the reserve day across UTC midnight", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-27T23:59:59Z"));
      const kv = createMemoryKV();
      const deps = createNarrationDeps({ kv, env: ENV, synthesize: async () => { throw new Error("unused"); } });
      expect(await deps.budget?.reserve(100)).toBe(true);
      vi.setSystemTime(new Date("2026-10-28T00:00:01Z"));
      await deps.budget?.refund(100);
      expect(Number(await kv.get(dailySpendKey("2026-10-27")))).toBe(0);
      expect(await kv.get(dailySpendKey("2026-10-28"))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
