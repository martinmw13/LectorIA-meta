import { describe, expect, it } from "vitest";
import { buildBook, canonicalLines, CHAPTER_HEADING, splitChapters, splitParagraphs, stripGutenberg } from "./gutenberg";

const L = (...lines: string[]) => lines.join("\r\n");

// Small fixture shaped like the real file: CRLF, Contents lookalikes,
// an Introduction, two chapters, one illustration line.
const RAW = L(
  "Title: Oz",
  "",
  "*** START OF THE PROJECT GUTENBERG EBOOK OZ ***",
  "",
  "[Illustration]",
  "",
  "Contents",
  "",
  " Introduction",
  " Chapter I. The Cyclone",
  " Chapter II. The Council",
  "",
  "Introduction",
  "",
  "Some intro text",
  "across two lines.",
  "",
  "Chapter I",
  "The Cyclone",
  "",
  "Dorothy lived in Kansas,",
  "with Uncle Henry.",
  "",
  "[Illustration: Dorothy and Toto]",
  "",
  "The wind blew hard that day.",
  "",
  "Chapter II",
  "The Council",
  "",
  "The Munchkins gathered round.",
  "",
  "*** END OF THE PROJECT GUTENBERG EBOOK OZ ***",
  "",
  "License text here.",
);

describe("stripGutenberg", () => {
  it("keeps only the body between the markers", () => {
    const body = stripGutenberg(RAW);
    expect(body).toContain("Dorothy lived");
    expect(body).not.toContain("License text");
    expect(body).not.toContain("Title: Oz");
  });
  it("throws when a marker is missing", () => {
    expect(() => stripGutenberg("no markers")).toThrow();
    expect(() => stripGutenberg("*** START OF THE PROJECT GUTENBERG EBOOK X *** only")).toThrow();
  });
});

describe("splitParagraphs", () => {
  it("unwraps single newlines and drops blank blocks", () => {
    expect(splitParagraphs("a,\r\nb.\r\n\r\n\r\nc.")).toEqual(["a, b.", "c."]);
  });
});

describe("chapter heading", () => {
  it("matches bare headings but not Contents lines", () => {
    expect(CHAPTER_HEADING.exec("Chapter I")).not.toBeNull();
    expect(CHAPTER_HEADING.exec(" Chapter I. The Cyclone")).toBeNull();
  });
});

describe("splitChapters and buildBook", () => {
  it("drops front matter and illustrations, assigns ids and ordinals", () => {
    const drafts = splitChapters(stripGutenberg(RAW));
    expect(drafts.map((d) => d.title)).toEqual(["The Cyclone", "The Council"]);
    expect(drafts[0]?.paragraphs).toEqual([
      "Dorothy lived in Kansas, with Uncle Henry.",
      "The wind blew hard that day.",
    ]);
    const book = buildBook({ id: "oz", title: "T", author: "A", gutenberg: 55, chapters: drafts });
    expect(book.chapters).toEqual([
      { ch: 1, title: "The Cyclone", start_n: 1, end_n: 2 },
      { ch: 2, title: "The Council", start_n: 3, end_n: 3 },
    ]);
    expect(book.paragraphs.map((p) => [p.id, p.n])).toEqual([
      ["c1p1", 1],
      ["c1p2", 2],
      ["c2p1", 3],
    ]);
    expect(book.source.url).toContain("55");
  });
});

describe("canonicalLines", () => {
  it("joins id and text with tabs", () => {
    expect(canonicalLines([{ id: "c1p1", text: "hi" }])).toBe("c1p1\thi");
  });
});
