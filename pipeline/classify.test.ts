import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runClassify } from "./classify";
import type { JevClient, JevResult } from "./jev";
import type { MetaClient } from "./meta";
import { jevCostUsd, metaCostUsd } from "./prices";

function jevResult(overrides?: Partial<JevResult>): JevResult {
  return {
    vector: { calma: 0, alegria: 0, tristeza: 0, suspenso: 0.1, misterio: 0, aventura: 0, combate: 0.9, asombro: 0, unknown: 0 },
    choice: "combate",
    confidence: 0.87,
    intensity: 0.9,
    intensity_confidence: 0.9,
    tempo: 0.8,
    tempo_confidence: 0.8,
    model: "jev-1.14.0",
    input_tokens: 400,
    output_tokens: 60,
    ...overrides,
  };
}

function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "classify-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "book.json"),
    JSON.stringify({
      id: "oz",
      title: "Oz",
      author: "A",
      source: { gutenberg: 55, url: "u" },
      textVersion: "sha256:x",
      chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 3 }],
      paragraphs: [
        { id: "c1p1", ch: 1, n: 1, text: "calm meadow" },
        { id: "c1p2", ch: 1, n: 2, text: "a storm comes" },
        { id: "c1p3", ch: 1, n: 3, text: "the fight" },
      ],
    }),
  );
  writeFileSync(
    join(dir, "scenes.json"),
    JSON.stringify({
      bookId: "oz",
      textVersion: "sha256:x",
      scenes: [
        { id: "c1s1", ch: 1, start_n: 1, end_n: 1, title: "Meadow", summary: "s", characters: [] },
        { id: "c1s2", ch: 1, start_n: 2, end_n: 2, title: "Storm", summary: "s", characters: [] },
        { id: "c1s3", ch: 1, start_n: 3, end_n: 3, title: "Fight", summary: "s", characters: [] },
      ],
      provenance: {
        date: "d",
        meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 100, completion_tokens: 50, cost_usd: 0.001 },
      },
    }),
  );
  return dir;
}

describe("runClassify with fake clients", () => {
  it("takes the override path, the hard failure path, and totals costs", async () => {
    const dir = setupDir();
    const calls: string[] = [];
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ sceneTitle }) => {
        calls.push(sceneTitle);
        if (sceneTitle === "Meadow") return jevResult(); // confident, direct final
        if (sceneTitle === "Storm") {
          return jevResult({ choice: "unknown", confidence: 0.2, vector: { ...jevResult().vector, unknown: 0.6, combate: 0.2 } });
        }
        throw new Error("boom"); // hard failure stores no vector
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async () => ({
        data: { vector: { calma: 0.1, alegria: 0, tristeza: 0, suspenso: 0.7, misterio: 0.2, aventura: 0, combate: 0, asombro: 0 }, reason: "Storm mood." },
        promptTokens: 500,
        cachedTokens: 0,
        completionTokens: 40,
      }),
    };
    const scenes = await runClassify({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(calls).toEqual(["Meadow", "Storm", "Fight"]);

    const [meadow, storm, fight] = scenes;
    expect(meadow?.final?.vector.combate).toBeCloseTo(0.9, 10); // 0.9/(0.9+0.1)
    expect(meadow?.muse_override).toBeNull();
    expect(storm?.muse_override?.reason).toBe("Storm mood.");
    expect(storm?.final?.vector.suspenso).toBeCloseTo(0.7, 10);
    expect(storm?.final?.intensity).toBe(0.9); // intensity always from Jev
    expect(fight?.final).toBeNull();
    expect(fight?.jev).toBeNull();
    expect(fight?.error).toContain("boom");

    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      override_rate: number;
      provenance: { jev: { cost_usd: number }; meta: { cost_usd: number }; total_cost_usd: number };
    };
    expect(written.override_rate).toBeCloseTo(1 / 3, 10);
    const jevCost = jevCostUsd(800); // two Jev calls at 400 input tokens
    const overrideCost = metaCostUsd({ prompt: 500, cached: 0, completion: 40 });
    expect(written.provenance.jev.cost_usd).toBeCloseTo(jevCost, 10);
    expect(written.provenance.meta.cost_usd).toBeCloseTo(0.001 + overrideCost, 10);
    expect(written.provenance.total_cost_usd).toBeCloseTo(jevCost + 0.001 + overrideCost, 10);
  });

  it("records an error when the override vector is all zero", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async () => jevResult({ choice: "unknown", confidence: 0.1 }),
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async () => ({
        data: { vector: { calma: 0, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }, reason: "None." },
        promptTokens: 10,
        cachedTokens: 0,
        completionTokens: 5,
      }),
    };
    const scenes = await runClassify({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.every((s) => s.final === null && s.error !== null)).toBe(true);
  });

  it("carries provenance.resplit forward and refuses duplicate scene ids", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async () => jevResult(),
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async () => ({ data: {}, promptTokens: 1, cachedTokens: 0, completionTokens: 1 }),
    };
    await runClassify({ bookKey: "oz", force: true, dir }, { jev, meta });
    const first = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as { provenance: Record<string, unknown> };
    const resplit = { auto_margin: 0.3, splits: [] };
    writeFileSync(join(dir, "analysis.json"), JSON.stringify({ ...first, provenance: { ...first.provenance, resplit } }));
    await runClassify({ bookKey: "oz", force: true, dir }, { jev, meta });
    const second = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as { provenance: { resplit: unknown } };
    expect(second.provenance.resplit).toEqual(resplit);

    const scenesFile = JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) as { scenes: unknown[] };
    writeFileSync(join(dir, "scenes.json"), JSON.stringify({ ...scenesFile, scenes: [scenesFile.scenes[0], scenesFile.scenes[0]] }));
    await expect(runClassify({ bookKey: "oz", force: true, dir }, { jev, meta })).rejects.toThrow(/duplicate scene id/);
  });
});
