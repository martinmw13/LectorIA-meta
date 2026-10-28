import { describe, expect, it } from "vitest";
import { buildReaderModel } from "./reader";
import type { AnalyzedScene, Book } from "./types";

const book: Pick<Book, "id" | "title" | "author" | "chapters" | "paragraphs" | "textVersion"> = {
  id: "oz",
  textVersion: "v1",
  title: "Oz",
  author: "Baum",
  chapters: [
    { ch: 1, title: "One", start_n: 1, end_n: 3 },
    { ch: 2, title: "Two", start_n: 4, end_n: 5 },
  ],
  paragraphs: [
    { id: "c1p1", ch: 1, n: 1, text: "a" },
    { id: "c1p2", ch: 1, n: 2, text: "b" },
    { id: "c1p3", ch: 1, n: 3, text: "c" },
    { id: "c2p1", ch: 2, n: 4, text: "d" },
    { id: "c2p2", ch: 2, n: 5, text: "e" },
  ],
};

function scene(over: Partial<AnalyzedScene> & { id: string }): AnalyzedScene {
  return {
    start_n: 1,
    end_n: 1,
    title: "S",
    summary: "",
    characters: [],
    ch: 1,
    jev: null,
    muse_override: null,
    final: null,
    error: null,
    ...over,
  };
}

const scenes: AnalyzedScene[] = [
  scene({ id: "c1s1", start_n: 1, end_n: 2, final: null, error: "boom" }),
  scene({
    id: "c1s2",
    start_n: 3,
    end_n: 3,
    final: { vector: { calma: 1, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }, intensity: 0.2, tempo: 0.3 },
  }),
  scene({ id: "c2s1", ch: 2, start_n: 4, end_n: 5, final: null, error: "boom" }),
];

describe("buildReaderModel", () => {
  it("builds chapters in reading order with every paragraph once", () => {
    const model = buildReaderModel(book, { scenes });
    expect(model.bookId).toBe("oz");
    expect(model.chapters.map((c) => c.ch)).toEqual([1, 2]);
    expect(model.chapters.flatMap((c) => c.scenes).map((s) => s.id)).toEqual(["c1s1", "c1s2", "c2s1"]);
    expect(model.chapters.flatMap((c) => c.scenes).flatMap((s) => s.paragraphs.map((p) => p.n))).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps null emotion for failed scenes", () => {
    const model = buildReaderModel(book, { scenes });
    expect(model.chapters[0]?.scenes[0]?.emotion).toBeNull();
    expect(model.chapters[0]?.scenes[1]?.emotion?.intensity).toBe(0.2);
  });

  it("drops analysis internals", () => {
    const model = buildReaderModel(book, { scenes });
    expect(JSON.stringify(model)).not.toContain("muse_override");
    expect(JSON.stringify(model)).not.toContain("jev");
  });

  it("throws on unordered scenes, gaps, overlaps, crossings", () => {
    expect(() => buildReaderModel(book, { scenes: [...scenes].reverse() })).toThrow();
    const gap = scenes.filter((s) => s.id !== "c1s2");
    expect(() => buildReaderModel(book, { scenes: gap })).toThrow();
    const overlap = [...scenes];
    overlap[1] = scene({ id: "c1s2", start_n: 2, end_n: 3, final: null, error: "x" });
    expect(() => buildReaderModel(book, { scenes: overlap })).toThrow();
    const cross = [...scenes];
    cross[1] = scene({ id: "c1s2", start_n: 3, end_n: 4, final: null, error: "x" });
    expect(() => buildReaderModel(book, { scenes: cross })).toThrow();
  });
});
