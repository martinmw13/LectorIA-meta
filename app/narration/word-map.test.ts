import { describe, expect, it } from "vitest";
import { wordsInFragment } from "./word-map";

// “Oz’s,” didn’t run — punctuation and curly quotes never highlight,
// and Oz’s / didn't each stay one word: [start, end, t0, t1, ...].
const TEXT = "“Oz’s,” didn’t run";
const W = [
  1, 5, 0.0, 0.4, // Oz’s
  8, 14, 0.5, 0.9, // didn’t
  15, 18, 1.0, 1.2, // run
];

describe("wordsInFragment", () => {
  it("returns every word of a whole fragment in fragment offsets", () => {
    expect(wordsInFragment(W, 0, TEXT.length)).toEqual([
      { start: 1, end: 5, t0: 0.0, t1: 0.4 },
      { start: 8, end: 14, t0: 0.5, t1: 0.9 },
      { start: 15, end: 18, t0: 1.0, t1: 1.2 },
    ]);
  });

  it("splits a paragraph across two fragments with no word lost or doubled", () => {
    const first = wordsInFragment(W, 0, 7);
    const second = wordsInFragment(W, 7, TEXT.length - 7);
    expect(first.map((w) => [w.start, w.end])).toEqual([[1, 5]]);
    expect(second.map((w) => [w.start, w.end])).toEqual([
      [1, 7],
      [8, 11],
    ]);
    // Fragment-relative offsets point back at the paragraph text.
    for (const [frag, from] of [
      [first, 0],
      [second, 7],
    ] as const) {
      for (const word of frag) {
        const abs = TEXT.slice(from + word.start, from + word.end);
        expect(abs).not.toContain(" ");
        expect(abs.length).toBeGreaterThan(0);
      }
    }
  });

  it("ignores timings outside the fragment", () => {
    expect(wordsInFragment(W, 20, 5)).toEqual([]);
  });
});
