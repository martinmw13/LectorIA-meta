import { describe, expect, it } from "vitest";
import { planRanges } from "./ranges";

// “Oz’s,” didn’t run split across two fragments: the cut lands on the
// space, so each word sits whole in one fragment. Punctuation and curly
// quotes never highlight: slicing the fixture texts at the planned
// offsets yields letters only.
const TEXT = "“Oz’s,” didn’t run";
const FRAGS = [
  { text: "“Oz’s,”", from: 0 },
  { text: " didn’t run", from: 7 },
];
const CHUNK = { start: 0, end: 18, w: [1, 5, 0.0, 0.4, 8, 14, 0.5, 0.9, 15, 18, 1.0, 1.2] };

function slice(frag: number, start: number, end: number): string {
  return (FRAGS[frag] as { text: string }).text.slice(start, end);
}

describe("planRanges", () => {
  it("maps each word to its fragment, letters only", () => {
    const zero = planRanges(FRAGS.map(({ from, text }) => ({ from, len: text.length })), CHUNK, 0);
    expect(zero.word).toMatchObject({ frag: 0, start: 1, end: 5 });
    expect(slice(zero.word!.frag, zero.word!.start, zero.word!.end)).toBe("Oz’s");
    const one = planRanges(FRAGS.map(({ from, text }) => ({ from, len: text.length })), CHUNK, 1);
    expect(one.word).toMatchObject({ frag: 1, start: 1, end: 7 });
    expect(slice(one.word!.frag, one.word!.start, one.word!.end)).toBe("didn’t");
    const two = planRanges(FRAGS.map(({ from, text }) => ({ from, len: text.length })), CHUNK, 2);
    expect(two.word).toMatchObject({ frag: 1, start: 8, end: 11 });
    expect(slice(two.word!.frag, two.word!.start, two.word!.end)).toBe("run");
  });

  it("covers the sentence across split fragments with no gaps", () => {
    const { sentence } = planRanges(FRAGS.map(({ from, text }) => ({ from, len: text.length })), CHUNK, 1);
    expect(sentence.map((part) => slice(part.frag, part.start, part.end)).join("")).toBe(TEXT);
  });

  it("returns no word off the words", () => {
    const frags = FRAGS.map(({ from, text }) => ({ from, len: text.length }));
    expect(planRanges(frags, CHUNK, -1).word).toBeNull();
    expect(planRanges(frags, CHUNK, 9).word).toBeNull();
  });
});
