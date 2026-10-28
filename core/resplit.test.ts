import { describe, expect, it } from "vitest";
import { bestBoundary, buildWindows, decideMargin, isResplitCandidate, planSplits, splitIds, topOf } from "./resplit";
import type { Vector8 } from "./types";

function vector(top: string, value: number, other = "tristeza"): Vector8 {
  const v = { calma: 0, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 } as Vector8;
  v[top as keyof Vector8] = value;
  v[other as keyof Vector8] = 1 - value;
  return v;
}

function calmWindow(n: number, words = 130) {
  return { startN: n, endN: n, words, vector: vector("calma", 0.8, "tristeza") };
}

function combatWindow(n: number, words = 130) {
  return { startN: n, endN: n, words, vector: vector("combate", 0.8, "calma") };
}

describe("isResplitCandidate", () => {
  it("takes long, unsure, and close scenes but never null or short ones", () => {
    expect(isResplitCandidate(400, { vector: vector("calma", 0.9) })).toBe(true);
    expect(isResplitCandidate(300, { vector: { ...vector("calma", 0.4), tristeza: 0.35 } })).toBe(true);
    expect(isResplitCandidate(300, { vector: vector("calma", 0.55, "tristeza") })).toBe(true);
    expect(isResplitCandidate(300, null)).toBe(false);
    expect(isResplitCandidate(239, { vector: vector("calma", 0.3) })).toBe(false);
    expect(isResplitCandidate(300, { vector: vector("calma", 0.9) })).toBe(false);
  });
});

describe("buildWindows", () => {
  const para = (n: number, words: number) => ({ n, text: Array(words).fill("word").join(" ") });
  it("packs whole paragraphs into about 100 to 160 words", () => {
    const spans = buildWindows([para(1, 60), para(2, 60), para(3, 60), para(4, 60), para(5, 60)]);
    expect(spans).toEqual([
      { startN: 1, endN: 2, words: 120 },
      { startN: 3, endN: 5, words: 180 },
    ]);
  });
  it("keeps a single long paragraph as its own window", () => {
    expect(buildWindows([para(1, 500)])).toEqual([{ startN: 1, endN: 1, words: 500 }]);
  });
  it("merges a short tail into the previous window", () => {
    expect(buildWindows([para(1, 110), para(2, 110), para(3, 20)])).toEqual([
      { startN: 1, endN: 1, words: 110 },
      { startN: 2, endN: 3, words: 130 },
    ]);
  });
});

describe("bestBoundary", () => {
  it("auto-splits a strong sequential shift", () => {
    const best = bestBoundary([calmWindow(1), calmWindow(2), combatWindow(3), combatWindow(4)]);
    expect(best?.index).toBe(2);
    expect(best?.left).toBe("calma");
    expect(best?.right).toBe("combate");
    expect(decideMargin(best?.margin ?? 0)).toBe("auto");
  });
  it("leaves a simultaneous blend alone when the top stays the same", () => {
    const blend = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("calma", 0.55, "tristeza") });
    expect(bestBoundary([blend(1), blend(2), blend(3), blend(4)])).toBeNull();
  });
  it("rejects a one-window spike that does not persist", () => {
    const best = bestBoundary([calmWindow(1), calmWindow(2), combatWindow(3, 60), calmWindow(4)]);
    expect(best).toBeNull();
  });
  it("accepts one long window as persistence", () => {
    const best = bestBoundary([calmWindow(1), calmWindow(2), combatWindow(3, 200)]);
    expect(best?.index).toBe(2);
    expect(decideMargin(best?.margin ?? 0)).toBe("auto");
  });
  it("never leaves a part under 120 words", () => {
    const best = bestBoundary([calmWindow(1, 400), combatWindow(2, 119), calmWindow(3, 400)]);
    expect(best).toBeNull();
  });
  it("rates a weak shift as ambiguous", () => {
    const weak = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("calma", 0.62, "combate") });
    const strong = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("combate", 0.62, "calma") });
    const best = bestBoundary([weak(1), weak(2), strong(3), strong(4)]);
    expect(best?.index).toBe(2);
    expect(decideMargin(best?.margin ?? -1)).toBe("ask");
  });
});

describe("planSplits", () => {
  it("recurses into two splits when both ask calls agree", async () => {
    const sad = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("tristeza", 0.8, "calma") });
    const windows = [calmWindow(1), calmWindow(2), combatWindow(3), combatWindow(4), sad(5), sad(6)];
    expect(await planSplits(windows, async () => true)).toEqual([2, 4]);
  });
  it("stops when the asker says no", async () => {
    const windows = [calmWindow(1), calmWindow(2), combatWindow(3), combatWindow(4)];
    // Margin here is auto, so the asker is never consulted.
    expect(await planSplits(windows, async () => false)).toEqual([2]);
    const weak = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("calma", 0.62, "combate") });
    const strong = (n: number) => ({ startN: n, endN: n, words: 130, vector: vector("combate", 0.62, "calma") });
    expect(await planSplits([weak(1), weak(2), strong(3), strong(4)], async () => false)).toEqual([]);
  });
});

describe("splitIds", () => {
  it("keeps the first id and suffixes the rest", () => {
    expect(splitIds("c5s2", 3)).toEqual(["c5s2", "c5s2b", "c5s2c"]);
    expect(splitIds("c5s2", 1)).toEqual(["c5s2"]);
  });
});

describe("topOf", () => {
  it("returns the top id, value, and gap", () => {
    const top = topOf(vector("combate", 0.7));
    expect(top.id).toBe("combate");
    expect(top.value).toBeCloseTo(0.7, 10);
    expect(top.gap).toBeCloseTo(0.4, 10);
  });
});
