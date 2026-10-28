import { describe, expect, it } from "vitest";
import { planRanges } from "./ranges";

// “Oz’s,” didn’t run — punctuation and curly quotes never highlight:
// slicing the text at the planned offsets yields letters only.
const TEXT = "“Oz’s,” didn’t run";
const CHUNK = { start: 0, end: 18, w: [1, 5, 0.0, 0.4, 8, 14, 0.5, 0.9, 15, 18, 1.0, 1.2] };

describe("planRanges", () => {
  it("maps each word to letters only", () => {
    expect(planRanges(TEXT.length, CHUNK, 0).word).toMatchObject({ start: 1, end: 5 });
    expect(TEXT.slice(1, 5)).toBe("Oz’s");
    expect(planRanges(TEXT.length, CHUNK, 1).word).toMatchObject({ start: 8, end: 14 });
    expect(TEXT.slice(8, 14)).toBe("didn’t");
    expect(planRanges(TEXT.length, CHUNK, 2).word).toMatchObject({ start: 15, end: 18 });
    expect(TEXT.slice(15, 18)).toBe("run");
  });

  it("covers the sentence with no gaps", () => {
    const { sentence } = planRanges(TEXT.length, CHUNK, 1);
    expect(sentence.map((part) => TEXT.slice(part.start, part.end)).join("")).toBe(TEXT);
  });

  it("clips a chunk past the paragraph and returns no word off the words", () => {
    const { sentence, word } = planRanges(10, { ...CHUNK, end: 40 }, 1);
    expect(sentence).toMatchObject([{ start: 0, end: 10 }]);
    expect(word).toMatchObject({ start: 8, end: 10 });
    expect(planRanges(TEXT.length, CHUNK, -1).word).toBeNull();
    expect(planRanges(TEXT.length, CHUNK, 9).word).toBeNull();
  });
});
