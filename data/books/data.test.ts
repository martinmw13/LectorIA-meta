// Data test: loads the real generated Oz files when present (skips any
// missing file) and checks the pipeline invariants hold end to end.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateBookCoverage } from "../../core/scenes";
import { EMOTIONS } from "../../core/types";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "oz");

function load(name: string): unknown | null {
  const path = join(DIR, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("oz data files", () => {
  it("book has 24 chapters and sequential ordinals", () => {
    const book = load("book.json") as {
      chapters: { ch: number; start_n: number; end_n: number }[];
      paragraphs: { n: number }[];
      textVersion: string;
    } | null;
    if (!book) return;
    expect(book.chapters.length).toBe(24);
    expect(book.paragraphs.map((p, i) => p.n)).toEqual(book.paragraphs.map((_, i) => i + 1));
    expect(book.textVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("scenes cover every paragraph exactly once", () => {
    const book = load("book.json") as {
      textVersion: string;
      chapters: { ch: number; title: string; start_n: number; end_n: number }[];
      paragraphs: { id: string; ch: number; n: number; text: string }[];
    } | null;
    const scenesFile = load("scenes.json") as {
      textVersion: string;
      scenes: { id: string; ch: number; start_n: number; end_n: number; title: string; summary: string; characters: string[] }[];
    } | null;
    if (!book || !scenesFile) return;
    expect(scenesFile.textVersion).toBe(book.textVersion);
    expect(validateBookCoverage(book, scenesFile.scenes)).toEqual([]);
  });

  it("final vectors sum to 1", () => {
    const analysis = load("analysis.json") as {
      textVersion: string;
      scenes: { id: string; final: { vector: Record<string, number> } | null }[];
    } | null;
    if (!analysis) return;
    for (const scene of analysis.scenes) {
      if (!scene.final) continue;
      const sum = Object.values(scene.final.vector).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
      expect(Object.keys(scene.final.vector).sort()).toEqual([...EMOTIONS].sort());
    }
  });

  it("every classified scene sits in exactly one cluster", () => {
    const analysis = load("analysis.json") as { scenes: { id: string; final: unknown }[] } | null;
    const music = load("music-clusters.json") as { clusters: { scenes: string[] }[] } | null;
    if (!analysis || !music) return;
    const classified = analysis.scenes.filter((s) => s.final !== null).map((s) => s.id).sort();
    const clustered = music.clusters.flatMap((c) => c.scenes).sort();
    expect(clustered).toEqual(classified);
  });
});
