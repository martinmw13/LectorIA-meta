// runNarrate with a fake synthesize and a temp book dir: every chapter
// gets a manifest, a second run is all cached at zero cost, and a tiny
// cap stops the run from spending more.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NarrationDeps } from "../core/narration-cache";
import { runNarrate } from "./narrate";
import type { ChapterNarration } from "../core/narration";

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

function fakeSynthesize() {
  let calls = 0;
  const synthesize: NarrationDeps["synthesize"] = async ({ texts, gaps }) => {
    calls += 1;
    return {
      mp3: new Uint8Array([calls]),
      durationSec: texts.length * 2 + gaps.reduce((a, b) => a + b, 0),
      spans: texts.map((_, i) => ({ t0: i * 2, t1: i * 2 + 1.5, words: [] as [string, number, number][] })),
      gpuSec: 7.1,
    };
  };
  return { synthesize, calls: () => calls };
}

function memoryStore() {
  const audio = new Map<string, Uint8Array>();
  const manifests = new Map<string, ChapterNarration>();
  const store: NarrationDeps["store"] = {
    getManifest: async (key: string) => manifests.get(key) ?? null,
    putAudio: async (key: string, mp3: Uint8Array) => {
      audio.set(key, mp3);
      return `https://blob.example.com/${key}.mp3`;
    },
    putManifest: async (key: string, value: ChapterNarration) => {
      manifests.set(key, value);
    },
  };
  return { store, audio, manifests };
}

function setupMixedBook(dir: string): void {
  // Distinct text per chapter so the fake can fail exactly one of them.
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
      paragraphs: [
        { id: "c1p1", ch: 1, n: 1, text: `Dorothy walked the long dusty road with Toto beside her.` },
        { id: "c1p2", ch: 1, n: 2, text: `The yellow brick road stretched far ahead of them.` },
        { id: "c2p3", ch: 2, n: 3, text: `FAIL the wicked witch cackled in the dark castle.` },
        { id: "c2p4", ch: 2, n: 4, text: `FAIL flying monkeys circled above the high walls.` },
      ],
    }),
  );
}

function readNarration(dir: string): { provenance: Record<string, unknown>; chapters: Record<string, ChapterNarration> } {
  return JSON.parse(readFileSync(join(dir, "narration.json"), "utf8")) as {
    provenance: Record<string, unknown>;
    chapters: Record<string, ChapterNarration>;
  };
}

describe("runNarrate", () => {
  it("writes manifests for every chapter, then reuses them at zero cost", async () => {
    const dir = mkdtempSync(join(tmpdir(), "narrate-"));
    setupBook(dir);
    const { synthesize, calls } = fakeSynthesize();
    const { store } = memoryStore();
    const ctx = { bookKey: "oz", force: false, dir };

    const first = await runNarrate(ctx, { synthesize, store, capUsd: 2 });
    expect(first).toMatchObject({ generated: 2, cached: 0, stopped: false });
    expect(first.estimatedMicro).toBeGreaterThan(0);
    expect(first.actualMicro).toBeGreaterThan(0);
    expect(calls()).toBe(2);
    const file = readNarration(dir);
    expect(Object.keys(file.chapters).sort()).toEqual(["1", "2"]);
    expect(file.provenance.voice).toBe("af_heart");
    expect(file.provenance.chapters_generated).toBe(2);
    for (const manifest of Object.values(file.chapters)) {
      expect(manifest.src).toMatch(/^https:\/\//);
      expect(manifest.chunks.length).toBeGreaterThan(0);
    }

    const bytes = readFileSync(join(dir, "narration.json"), "utf8");
    const second = await runNarrate({ ...ctx }, { synthesize, store, capUsd: 2 });
    expect(second).toMatchObject({ generated: 0, cached: 2, stopped: false });
    expect(second.estimatedMicro).toBe(0);
    expect(second.actualMicro).toBe(0);
    expect(calls()).toBe(2);
    expect(readFileSync(join(dir, "narration.json"), "utf8")).toBe(bytes);
  });

  it("stops spending once the cap refuses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "narrate-cap-"));
    setupBook(dir);
    const { synthesize, calls } = fakeSynthesize();
    const { store } = memoryStore();

    const stats = await runNarrate({ bookKey: "oz", force: false, dir }, { synthesize, store, capUsd: 0 });
    expect(stats.stopped).toBe(true);
    expect(calls()).toBe(0);
    expect(stats.estimatedMicro).toBe(0);

    // A zero estimate would still reserve; with a real cap the first
    // chapter generates and the rest stop.
    const dir2 = mkdtempSync(join(tmpdir(), "narrate-cap2-"));
    setupBook(dir2);
    const again = fakeSynthesize();
    const store2 = memoryStore();
    const stats2 = await runNarrate({ bookKey: "oz", force: false, dir: dir2 }, { synthesize: again.synthesize, store: store2.store, capUsd: 0.002 });
    expect(stats2.stopped).toBe(true);
    expect(again.calls()).toBeLessThan(2);
    expect(again.calls()).toBeGreaterThanOrEqual(1);
  });

  it("writes the ready chapters with no input and fails when one chapter fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "narrate-fail-"));
    setupMixedBook(dir);
    const { store } = memoryStore();
    const good = fakeSynthesize();
    const ctx = { bookKey: "oz", force: false, dir };
    const flaky: NarrationDeps["synthesize"] = async (req) => {
      if (req.texts.some((t) => t.includes("FAIL"))) throw new Error("modal down");
      return good.synthesize(req);
    };
    await expect(runNarrate(ctx, { synthesize: flaky, store, capUsd: 2 })).rejects.toThrow(/chapter 2/);
    // The paid chapter is kept, and no input is recorded so the next run
    // redoes instead of reusing the partial file.
    const partial = readNarration(dir);
    expect(Object.keys(partial.chapters)).toEqual(["1"]);
    expect(partial.provenance.input).toBeNull();

    // The retry resumes the ready chapter and generates the missing one.
    const retry = await runNarrate(ctx, { synthesize: good.synthesize, store, capUsd: 2 });
    expect(retry).toMatchObject({ generated: 1, cached: 1, stopped: false });
    const file = readNarration(dir);
    expect(Object.keys(file.chapters).sort()).toEqual(["1", "2"]);
    expect(typeof file.provenance.input).toBe("string");
  });
});
