import { describe, expect, it } from "vitest";
import {
  buildNavIndex,
  buildReaderModel,
  buildSceneView,
  countWords,
  isSceneEntry,
  navReducer,
  observeSceneEntry,
  paginateScene,
} from "./reader";
import type { AnalyzedScene, Book } from "./types";
import type { NavIndex } from "./reader";

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

  it("paginates the whole book with no loss, duplication, or reorder", () => {
    const model = buildReaderModel(book, { scenes });
    const seen: number[] = [];
    for (const chapter of model.chapters) {
      for (const scene of chapter.scenes) {
        const pages = paginateScene(scene.paragraphs, 3);
        expect(pages.length).toBeGreaterThan(0);
        for (const page of pages) {
          for (const p of page.paragraphs) seen.push(p.n);
        }
      }
    }
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("splits at paragraph boundaries and never crosses scenes", () => {
    const model = buildReaderModel(book, { scenes });
    const first = model.chapters[0]?.scenes[0];
    if (!first) throw new Error("fixture scene missing");
    const pages = paginateScene(first.paragraphs, 1);
    expect(pages.map((p) => p.paragraphs.map((q) => q.n))).toEqual([[1], [2]]);
    expect(pages[0]).toMatchObject({ startN: 1, endN: 1, words: 1 });
  });

  it("gives an oversize paragraph its own page and an empty scene one page", () => {
    const big = paginateScene([{ id: "x", n: 9, text: "one two three four" }], 3);
    expect(big.length).toBe(1);
    expect(big[0]?.paragraphs.map((p) => p.id)).toEqual(["x"]);
    expect(paginateScene([], 3)).toEqual([{ paragraphs: [], startN: 0, endN: 0, words: 0 }]);
  });

  it("counts words on whitespace", () => {
    expect(countWords("  hola   mundo\n")).toBe(2);
  });

  it("builds one scene view with chapter counts and neighbor ids", () => {
    const model = buildReaderModel(book, { scenes });
    const view = buildSceneView(model, "c1s2", 3);
    expect(view).toMatchObject({ sceneId: "c1s2", ch: 1, chapterTitle: "One", k: 2, n: 2 });
    expect(view.prevSceneId).toBe("c1s1");
    expect(view.nextSceneId).toBe("c2s1");
    expect(view.pages.flatMap((p) => p.paragraphs.map((q) => q.n))).toEqual([3]);
  });

  it("crosses chapters at the edges and throws on unknown ids", () => {
    const model = buildReaderModel(book, { scenes });
    const first = buildSceneView(model, "c1s1", 3);
    expect(first.prevSceneId).toBeNull();
    expect(first.nextSceneId).toBe("c1s2");
    const last = buildSceneView(model, "c2s1", 3);
    expect(last.nextSceneId).toBeNull();
    expect(last.prevSceneId).toBe("c1s2");
    expect(last.prevPages).toBe(1);
    expect(() => buildSceneView(model, "nope", 3)).toThrow();
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

const index: NavIndex = buildNavIndex([
  { sceneId: "c1s1", pages: 2 },
  { sceneId: "c1s2", pages: 1 },
  { sceneId: "c2s1", pages: 3 },
]);

describe("navReducer", () => {
  it("moves across sub-pages, then into the next scene at page 0", () => {
    expect(navReducer({ sceneId: "c1s1", page: 0 }, { kind: "next" }, index)).toEqual({
      sceneId: "c1s1",
      page: 1,
    });
    expect(navReducer({ sceneId: "c1s1", page: 1 }, { kind: "next" }, index)).toEqual({
      sceneId: "c1s2",
      page: 0,
    });
  });

  it("goes back to the last sub-page of the previous scene", () => {
    expect(navReducer({ sceneId: "c1s2", page: 0 }, { kind: "prev" }, index)).toEqual({
      sceneId: "c1s1",
      page: 1,
    });
    expect(navReducer({ sceneId: "c2s1", page: 0 }, { kind: "prev" }, index)).toEqual({
      sceneId: "c1s2",
      page: 0,
    });
  });

  it("no-ops at book start and end, and on unknown goto ids", () => {
    expect(navReducer({ sceneId: "c1s1", page: 0 }, { kind: "prev" }, index)).toEqual({
      sceneId: "c1s1",
      page: 0,
    });
    expect(navReducer({ sceneId: "c2s1", page: 2 }, { kind: "next" }, index)).toEqual({
      sceneId: "c2s1",
      page: 2,
    });
    expect(
      navReducer({ sceneId: "c1s1", page: 0 }, { kind: "goto", sceneId: "nope" }, index),
    ).toEqual({ sceneId: "c1s1", page: 0 });
  });

  it("jumps to a scene id, at the end when asked", () => {
    expect(navReducer({ sceneId: "c1s1", page: 0 }, { kind: "goto", sceneId: "c2s1" }, index)).toEqual(
      { sceneId: "c2s1", page: 0 },
    );
    expect(
      navReducer({ sceneId: "c1s1", page: 0 }, { kind: "goto", sceneId: "c2s1", atEnd: true }, index),
    ).toEqual({ sceneId: "c2s1", page: 2 });
  });
});

describe("scene entry", () => {
  it("fires exactly once per scene entry and never on sub-page moves", () => {
    const calls: string[] = [];
    const observe = (id: string) => {
      calls.push(id);
    };
    let prev: string | null = null;
    for (const id of ["c1s1", "c1s1", "c1s2", "c1s2", "c2s1"]) {
      observeSceneEntry(prev, id, observe);
      prev = id;
    }
    expect(calls).toEqual(["c1s1", "c1s2", "c2s1"]);
    expect(isSceneEntry("c1s1", "c1s1")).toBe(false);
    expect(isSceneEntry("c1s1", "c1s2")).toBe(true);
    expect(isSceneEntry(null, "c1s1")).toBe(true);
  });
});
