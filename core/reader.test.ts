import { describe, expect, it } from "vitest";
import { buildReaderModel, countWords, isSceneEntry, nextSceneEntry, panelCaption } from "./reader";
import type { AnalyzedScene, Book, Vector8 } from "./types";
import { EMOTIONS } from "./types";
import type { MusicManifest, SelectEnv } from "./music";
import type { SceneSignal, Track } from "./music";
import { initScheduler, observeScene, tickScheduler } from "./music-schedule";

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

  it("covers every paragraph exactly once across chapters and scenes", () => {
    const model = buildReaderModel(book, { scenes });
    const seen = model.chapters.flatMap((c) => c.scenes.flatMap((s) => s.paragraphs.map((p) => p.n)));
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts words on whitespace", () => {
    expect(countWords("  hola   mundo\n")).toBe(2);
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

describe("panelCaption", () => {
  it("keeps a short summary whole", () => {
    expect(panelCaption("Dorothy wakes to bright sunshine.")).toBe("Dorothy wakes to bright sunshine.");
  });

  it("takes the first clause of a long summary", () => {
    const out = panelCaption(
      "Anxious watching turns to alarm as winds gather from north and south; Uncle Henry runs to the stock while Aunt Em screams.",
    );
    expect(out).toBe("Anxious watching turns to alarm as winds gather from north and south;");
  });

  it("cuts at a word boundary to 90 chars with an ellipsis", () => {
    const out = panelCaption(`Dorothy ${"walks ".repeat(30)}on quietly.`);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ $/);
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
