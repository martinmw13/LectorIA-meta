import { describe, expect, it } from "vitest";
import { validateBookCoverage, validateSceneCoverage } from "./scenes";
import type { Chapter, Scene, SceneInput } from "./types";

const CHAPTER: Chapter = { ch: 3, title: "T", start_n: 10, end_n: 14 };
const good = (start_n: number, end_n: number): SceneInput => ({
  start_n,
  end_n,
  title: "t",
  summary: "s",
  characters: [],
});

describe("validateSceneCoverage", () => {
  it("accepts exact coverage", () => {
    expect(validateSceneCoverage(CHAPTER, [good(10, 12), good(13, 14)])).toEqual([]);
  });
  it("reports a gap", () => {
    const problems = validateSceneCoverage(CHAPTER, [good(10, 11), good(13, 14)]);
    expect(problems.some((p) => p.code === "gap")).toBe(true);
  });
  it("reports an overlap", () => {
    const problems = validateSceneCoverage(CHAPTER, [good(10, 12), good(12, 14)]);
    expect(problems.some((p) => p.code === "overlap")).toBe(true);
  });
  it("reports a bad start and bad end", () => {
    expect(validateSceneCoverage(CHAPTER, [good(11, 14)]).some((p) => p.code === "bad-start")).toBe(true);
    expect(validateSceneCoverage(CHAPTER, [good(10, 13)]).some((p) => p.code === "bad-end")).toBe(true);
  });
  it("reports out of range and bad order", () => {
    expect(validateSceneCoverage(CHAPTER, [good(10, 15)]).some((p) => p.code === "out-of-range")).toBe(true);
    expect(validateSceneCoverage(CHAPTER, [good(12, 11)]).some((p) => p.code === "order")).toBe(true);
  });
});

describe("validateBookCoverage", () => {
  const book = {
    chapters: [
      { ch: 1, title: "A", start_n: 1, end_n: 2 },
      { ch: 2, title: "B", start_n: 3, end_n: 4 },
    ],
    paragraphs: [1, 2, 3, 4].map((n) => ({ id: `p${n}`, ch: n <= 2 ? 1 : 2, n, text: "x" })),
  };
  const scene = (id: string, ch: number, start_n: number, end_n: number): Scene => ({
    ...good(start_n, end_n),
    id,
    ch,
  });
  it("accepts full coverage", () => {
    expect(validateBookCoverage(book, [scene("c1s1", 1, 1, 2), scene("c2s1", 2, 3, 4)])).toEqual([]);
  });
  it("reports cross-chapter, gap, and overlap", () => {
    expect(
      validateBookCoverage(book, [scene("c1s1", 1, 1, 3)]).some((p) => p.code === "cross-chapter"),
    ).toBe(true);
    expect(validateBookCoverage(book, [scene("c1s1", 1, 1, 2)]).some((p) => p.code === "gap")).toBe(true);
    expect(
      validateBookCoverage(book, [scene("c1s1", 1, 1, 2), scene("c1s2", 1, 2, 2)]).some(
        (p) => p.code === "overlap",
      ),
    ).toBe(true);
  });
});
