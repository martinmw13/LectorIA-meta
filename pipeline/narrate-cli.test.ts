// parseNarrateArgs and the offline dry-run estimate: no Modal or Blob
// calls, only book.json reads.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateNarrationMicro } from "../core/narration";
import { SHELF_BOOKS, estimateBook, parseNarrateArgs } from "./narrate-cli";

function setupBook(dir: string): void {
  writeFileSync(
    join(dir, "book.json"),
    JSON.stringify({
      id: "oz",
      title: "Oz",
      author: "A",
      source: { gutenberg: 55, url: "u" },
      textVersion: "sha256:x",
      chapters: [
        { ch: 1, title: "One", start_n: 1, end_n: 2 },
        { ch: 2, title: "Two", start_n: 3, end_n: 4 },
      ],
      paragraphs: [1, 2, 3, 4].map((n) => ({
        id: `c${n <= 2 ? 1 : 2}p${n}`,
        ch: n <= 2 ? 1 : 2,
        n,
        text: `Dorothy walked the long dusty road with Toto beside her.`,
      })),
    }),
  );
}

describe("parseNarrateArgs", () => {
  it("expands all-shelf and all", () => {
    const selection = parseNarrateArgs(["--book", "all-shelf", "--voice", "all"]);
    expect(selection.books).toEqual(SHELF_BOOKS);
    expect(selection.books).toContain("oz");
    expect(selection.voices).toEqual(["af_heart", "am_michael"]);
    expect(selection.dryRun).toBe(false);
  });

  it("accepts one book and one voice plus flags", () => {
    const selection = parseNarrateArgs(["--book", "oz", "--voice", "am_michael", "--dry-run", "--force"]);
    expect(selection).toEqual({ books: ["oz"], voices: ["am_michael"], force: true, dryRun: true });
  });

  it("rejects missing and unknown values", () => {
    expect(() => parseNarrateArgs(["--voice", "all"])).toThrow(/usage/);
    expect(() => parseNarrateArgs(["--book", "oz"])).toThrow(/usage/);
    expect(() => parseNarrateArgs(["--book", "nope", "--voice", "all"])).toThrow(/unknown book/);
    expect(() => parseNarrateArgs(["--book", "oz", "--voice", "af_bella"])).toThrow(/unknown voice/);
  });
});

describe("estimateBook", () => {
  it("sums estimateNarrationMicro over every chapter", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrate-est-"));
    setupBook(dir);
    const estimate = estimateBook(dir);
    expect(estimate.chapters).toBe(2);
    expect(estimate.chars).toBeGreaterThan(0);
    const one = estimateNarrationMicro(`Dorothy walked the long dusty road with Toto beside her.`.length * 2);
    expect(estimate.micro).toBe(one * 2);
  });

  it("throws when the book was never built", () => {
    const dir = mkdtempSync(join(tmpdir(), "narrate-est-missing-"));
    expect(() => estimateBook(dir)).toThrow();
  });
});
