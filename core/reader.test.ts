import { describe, expect, it } from "vitest";
import {
  buildNavIndex,
  buildReaderModel,
  buildSceneView,
  countWords,
  isSceneEntry,
  navReducer,
  nextSceneEntry,
  paginateScene,
} from "./reader";
import type { AnalyzedScene, Book, Vector8 } from "./types";
import { EMOTIONS } from "./types";
import type { MusicManifest, SelectEnv } from "./music";
import type { SceneSignal, Track } from "./music";
import { initScheduler, observeScene, tickScheduler } from "./music-schedule";
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

  it("closes a page by lines for short dialogue paragraphs", () => {
    const paras = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, n: i + 1, text: '"Yes."' }));
    const pages = paginateScene(paras);
    expect(pages.map((p) => p.paragraphs.length)).toEqual([12, 8]);
    expect(pages.flatMap((p) => p.paragraphs.map((q) => q.n))).toEqual(paras.map((p) => p.n));
  });

  it("gives a single over-long paragraph its own page", () => {
    const paras = [
      { id: "a", n: 1, text: "short one" },
      { id: "b", n: 2, text: "x".repeat(58 * 14) },
      { id: "c", n: 3, text: "short two" },
    ];
    const pages = paginateScene(paras);
    expect(pages.map((p) => p.paragraphs.map((q) => q.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("paginates deterministically", () => {
    const paras = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, n: i + 1, text: '"Well?"' }));
    expect(paginateScene(paras)).toEqual(paginateScene(paras));
    expect(paginateScene(paras).length).toBe(4);
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
  it("observes once per route id, only after the manifest lands", () => {
    const calls: string[] = [];
    let observed: string | null = null;
    const run = (routeId: string | null, manifestReady: boolean) => {
      const gate = nextSceneEntry({ observedId: observed, routeId, manifestReady });
      observed = gate.nextObservedId;
      if (gate.shouldObserve && routeId) calls.push(routeId);
    };
    run("c1s1", false);
    run("c1s1", true);
    run("c1s1", true);
    run("c1s1", true);
    run("c1s2", true);
    run("c1s2", true);
    run("c1s1", true);
    expect(calls).toEqual(["c1s1", "c1s2", "c1s1"]);
    expect(isSceneEntry("c1s1", "c1s1")).toBe(false);
    expect(isSceneEntry("c1s1", "c1s2")).toBe(true);
    expect(isSceneEntry(null, "c1s1")).toBe(true);
  });

  it("moves the track after entry plus dwell, then holds across ticks", () => {
    const schedEnv: SelectEnv = {
      selection: { style: "orchestral" },
      rng: () => 0,
    };
    const vec = (top: string): Vector8 => {
      const v = Object.fromEntries(EMOTIONS.map((id) => [id, 0.01])) as Record<string, number>;
      v[top] = 0.93;
      return v as Vector8;
    };
    const track = (id: string, top: string): Track => ({
      id,
      src: `/music/${id}.mp3`,
      title: id,
      emotion: top as Track["emotion"],
      vector: vec(top),
      intensity: 0.5,
      tempo: 0.5,
      durationSec: 120,
      startSec: 0,
      gainDb: 0,
      loop: true,
      soundtrack: "snd",
      style: "orchestral",
    });
    const schedManifest: MusicManifest = {
      version: 3,
      styles: [{ id: "orchestral", name: "Orquesta" }],
      soundtracks: [{ id: "snd", name: "Snd", style: "orchestral" }],
      playlists: [],
      tracks: [track("calm", "calma"), track("storm", "combate")],
    };
    const dwell = { dwellSec: 5 };
    const calm: SceneSignal = { vector: vec("calma"), intensity: 0.5, tempo: 0.5 };
    const storm: SceneSignal = { vector: vec("combate"), intensity: 0.5, tempo: 0.5 };
    let d = observeScene(initScheduler(), "s1", calm, schedManifest, 0, schedEnv, dwell);
    expect(d.switchToId).toBe("calm");
    d = observeScene(d.state, "s2", storm, schedManifest, 100, schedEnv, dwell);
    expect(d.switchToId).toBeNull();
    const early = tickScheduler(d.state, storm, schedManifest, 102, schedEnv, dwell);
    expect(early.switchToId).toBeNull();
    const late = tickScheduler(d.state, storm, schedManifest, 106, schedEnv, dwell);
    expect(late.state.activeSceneId).toBe("s2");
    expect(late.switchToId).toBe("storm");
    const hold = tickScheduler(late.state, storm, schedManifest, 200, schedEnv, dwell);
    expect(hold.switchToId).toBeNull();
    expect(hold.state.currentId).toBe("storm");
  });
});
