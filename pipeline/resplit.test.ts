import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBookCoverage } from "../core/scenes";
import type { AnalyzedScene } from "../core/types";
import type { JevClient, JevResult } from "./jev";
import type { MetaClient } from "./meta";
import { runResplit } from "./resplit";

function para(n: number, marker: string): { id: string; ch: number; n: number; text: string } {
  return { id: `c1p${n}`, ch: 1, n, text: `${marker} ${Array(59).fill("filler").join(" ")}` };
}

function jevResult(vector: JevResult["vector"], choice: JevResult["choice"]): JevResult {
  return { vector, choice, confidence: 0.9, intensity: 0.5, intensity_confidence: 0.9, tempo: 0.5, tempo_confidence: 0.9, model: "jev-1.14.0", input_tokens: 100, output_tokens: 10 };
}

const V = {
  meadow: { calma: 0.8, alegria: 0, tristeza: 0.2, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 },
  storm: { calma: 0.2, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.8, asombro: 0, unknown: 0 },
  uneasy: { calma: 0.62, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.38, asombro: 0, unknown: 0 },
  tense: { calma: 0.38, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0.62, asombro: 0, unknown: 0 },
  quiet: { calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 },
} as Record<string, JevResult["vector"]>;

function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "resplit-"));
  const paragraphs = [para(1, "meadow"), para(2, "meadow"), para(3, "storm"), para(4, "storm"), para(5, "uneasy"), para(6, "uneasy"), para(7, "tense"), para(8, "tense"), para(9, "quiet"), para(10, "quiet")];
  writeFileSync(
    join(dir, "book.json"),
    JSON.stringify({ id: "oz", title: "Oz", author: "A", source: { gutenberg: 55, url: "u" }, textVersion: "sha256:x", chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 10 }], paragraphs }),
  );
  const scene = (id: string, start_n: number, end_n: number, vector: Record<string, number>) => ({
    id, ch: 1, start_n, end_n, title: id, summary: "s", characters: [],
    jev: null, muse_override: null, final: { vector, intensity: 0.5, tempo: 0.5 }, error: null,
  });
  writeFileSync(
    join(dir, "scenes.json"),
    JSON.stringify({
      bookId: "oz", textVersion: "sha256:x",
      scenes: [
        { id: "c1s1", ch: 1, start_n: 1, end_n: 4, title: "Mixed", summary: "s", characters: [] },
        { id: "c1s2", ch: 1, start_n: 5, end_n: 8, title: "Unsure", summary: "s", characters: [] },
        { id: "c1s3", ch: 1, start_n: 9, end_n: 10, title: "Quiet", summary: "s", characters: [] },
      ],
      provenance: { date: "d", meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 } },
    }),
  );
  writeFileSync(
    join(dir, "analysis.json"),
    JSON.stringify({
      bookId: "oz", textVersion: "sha256:x",
      scenes: [
        scene("c1s1", 1, 4, { calma: 0.55, tristeza: 0.45, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }),
        scene("c1s2", 5, 8, { calma: 0.4, combate: 0.35, tristeza: 0.25, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, asombro: 0 }),
        scene("c1s3", 9, 10, { calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 }),
      ],
      override_rate: 0,
      provenance: {
        date: "d",
        jev: { model: "jev-1.14.0", requests: 3, input_tokens: 300, output_tokens: 30, cost_usd: 0.0001 },
        meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 },
        total_cost_usd: 0.0011,
      },
    }),
  );
  return dir;
}

describe("runResplit with fake clients", () => {
  it("splits strong and muse-approved scenes, leaves the rest alone", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ scene }) => {
        const marker = ["meadow", "storm", "uneasy", "tense", "quiet"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = V[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        const choice = marker === "storm" || marker === "tense" ? "combate" : "calma";
        return jevResult(vector, choice);
      },
    };
    const metaCalls: string[] = [];
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async ({ schemaName, user }) => {
        metaCalls.push(schemaName);
        if (schemaName === "resplit_decision") {
          return { data: { split: true, reason: "Mood shifts and stays." }, promptTokens: 400, cachedTokens: 0, completionTokens: 20 };
        }
        const ranges = [...user.matchAll(/PART \d+ \[(\d+)\.\.(\d+)\]/g)].map((m) => ({ start_n: Number(m[1]), end_n: Number(m[2]) }));
        return {
          data: { parts: ranges.map((r, i) => ({ ...r, title: `Part ${i + 1}`, summary: "s", characters: [] })) },
          promptTokens: 800,
          cachedTokens: 0,
          completionTokens: 60,
        };
      },
    };
    const before = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as { scenes: AnalyzedScene[] };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s1b", "c1s2", "c1s2b", "c1s3"]);
    expect(scenes.map((s) => [s.start_n, s.end_n])).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
    expect(scenes.every((s) => s.final !== null)).toBe(true);

    const book = JSON.parse(readFileSync(join(dir, "book.json"), "utf8"));
    expect(validateBookCoverage(book, scenes)).toEqual([]);

    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      scenes: { id: string; final: unknown }[];
      provenance: { resplit: { candidates: number; windows_classified: number; splits: { from: string; at_n: number; decided_by: string; reason?: string; window_left: string; window_right: string; final_left: string | null; final_right: string | null }[]; merged_back: unknown[]; rejected: unknown[]; window_failures: string[] } };
    };
    expect(written.provenance.resplit.candidates).toBe(2);
    expect(written.provenance.resplit.windows_classified).toBe(4);
    expect(written.provenance.resplit.splits.map((s) => [s.from, s.at_n, s.decided_by])).toEqual([
      ["c1s1", 3, "rule"],
      ["c1s2", 7, "muse"],
    ]);
    expect(written.provenance.resplit.splits[0]).toMatchObject({ window_left: "calma", window_right: "combate", final_left: "calma", final_right: "combate" });
    expect(written.provenance.resplit.splits[1]?.reason).toBe("Mood shifts and stays.");
    expect(written.provenance.resplit.merged_back).toEqual([]);
    expect(written.provenance.resplit.rejected).toEqual([]);
    expect(written.provenance.resplit.window_failures).toEqual([]);

    expect(scenes.find((s) => s.id === "c1s3")).toEqual(before.scenes.find((s) => s.id === "c1s3"));

    const scenesFile = JSON.parse(readFileSync(join(dir, "scenes.json"), "utf8")) as { scenes: { id: string }[] };
    expect(scenesFile.scenes.map((s) => s.id)).toEqual(["c1s1", "c1s1b", "c1s2", "c1s2b", "c1s3"]);

    const callsAfterFirst = metaCalls.length;
    const again = await runResplit({ bookKey: "oz", force: false, dir }, { jev, meta });
    expect(again.map((s) => s.id)).toEqual(["c1s1", "c1s1b", "c1s2", "c1s2b", "c1s3"]);
    expect(metaCalls.length).toBe(callsAfterFirst);
  });

  it("merges the split back when both re-classified parts share the top emotion", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ sceneTitle, scene }) => {
        if (sceneTitle.startsWith("Part")) return jevResult({ calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 }, "calma");
        const marker = ["meadow", "storm"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = V[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        return jevResult(vector, marker === "storm" ? "combate" : "calma");
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async ({ schemaName, user }) => {
        if (schemaName === "resplit_decision") {
          return { data: { split: true, reason: "x" }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 };
        }
        const ranges = [...user.matchAll(/PART \d+ \[(\d+)\.\.(\d+)\]/g)].map((m) => ({ start_n: Number(m[1]), end_n: Number(m[2]) }));
        return {
          data: { parts: ranges.map((r, i) => ({ ...r, title: `Part ${i + 1}`, summary: "s", characters: [] })) },
          promptTokens: 1,
          cachedTokens: 0,
          completionTokens: 1,
        };
      },
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s2", "c1s3"]);
    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      provenance: { resplit: { splits: { from: string }[]; merged_back: { from: string; top: string | null }[] } };
    };
    expect(written.provenance.resplit.splits.filter((s) => s.from === "c1s1")).toEqual([]);
    expect(written.provenance.resplit.merged_back).toContainEqual({ from: "c1s1", top: "calma" });
  });

  it("keeps the scene when a window Jev call fails and records it", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ scene }) => {
        if (scene.includes("storm")) throw new Error("jev down");
        const marker = ["meadow", "uneasy", "tense", "quiet"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = V[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        return jevResult(vector, marker === "tense" ? "combate" : "calma");
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async () => ({ data: { split: false, reason: "Not sure." }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 }),
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s2", "c1s3"]);
    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      provenance: { resplit: { splits: unknown[]; window_failures: string[] } };
    };
    expect(written.provenance.resplit.splits).toEqual([]);
    expect(written.provenance.resplit.window_failures).toEqual(["c1s1"]);
  });

  it("records Muse rejections in provenance", async () => {
    const dir = setupDir();
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ scene }) => {
        const marker = ["meadow", "storm", "uneasy", "tense", "quiet"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = V[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        return jevResult(vector, marker === "storm" || marker === "tense" ? "combate" : "calma");
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async ({ schemaName, user }) => {
        if (schemaName === "resplit_decision") {
          return { data: { split: false, reason: "Just a blend." }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 };
        }
        const ranges = [...user.matchAll(/PART \d+ \[(\d+)\.\.(\d+)\]/g)].map((m) => ({ start_n: Number(m[1]), end_n: Number(m[2]) }));
        return {
          data: { parts: ranges.map((r, i) => ({ ...r, title: `Part ${i + 1}`, summary: "s", characters: [] })) },
          promptTokens: 1,
          cachedTokens: 0,
          completionTokens: 1,
        };
      },
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s1b", "c1s2", "c1s3"]);
    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      provenance: { resplit: { splits: { from: string }[]; rejected: { from: string; reason: string }[] } };
    };
    expect(written.provenance.resplit.rejected).toEqual([
      expect.objectContaining({ from: "c1s2", reason: "Just a blend." }),
    ]);
  });

  it("writes one entry per cut for a three-way split", async () => {
    const dir = mkdtempSync(join(tmpdir(), "resplit-"));
    const sad = { calma: 0.05, alegria: 0, tristeza: 0.95, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 };
    const paragraphs = [para(1, "meadow"), para(2, "meadow"), para(3, "storm"), para(4, "storm"), para(5, "sad"), para(6, "sad")];
    writeFileSync(
      join(dir, "book.json"),
      JSON.stringify({ id: "oz", title: "Oz", author: "A", source: { gutenberg: 55, url: "u" }, textVersion: "sha256:x", chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 6 }], paragraphs }),
    );
    const sceneFile = (id: string, vector: Record<string, number>) => ({
      id, ch: 1, start_n: 1, end_n: 6, title: id, summary: "s", characters: [],
      jev: null, muse_override: null, final: { vector, intensity: 0.5, tempo: 0.5 }, error: null,
    });
    writeFileSync(
      join(dir, "scenes.json"),
      JSON.stringify({
        bookId: "oz", textVersion: "sha256:x",
        scenes: [{ id: "c1s1", ch: 1, start_n: 1, end_n: 6, title: "Mixed", summary: "s", characters: [] }],
        provenance: { date: "d", meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 } },
      }),
    );
    writeFileSync(
      join(dir, "analysis.json"),
      JSON.stringify({
        bookId: "oz", textVersion: "sha256:x",
        scenes: [sceneFile("c1s1", { calma: 0.4, tristeza: 0.35, combate: 0.25, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, asombro: 0 })],
        override_rate: 0,
        provenance: {
          date: "d",
          jev: { model: "jev-1.14.0", requests: 1, input_tokens: 100, output_tokens: 10, cost_usd: 0.0001 },
          meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 },
          total_cost_usd: 0.0011,
        },
      }),
    );
    const vectors: Record<string, JevResult["vector"]> = { ...V, sad };
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ scene }) => {
        const marker = ["meadow", "storm", "sad"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = vectors[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        return jevResult(vector, marker === "meadow" ? "calma" : marker === "storm" ? "combate" : "tristeza");
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async ({ user }) => {
        const ranges = [...user.matchAll(/PART \d+ \[(\d+)\.\.(\d+)\]/g)].map((m) => ({ start_n: Number(m[1]), end_n: Number(m[2]) }));
        return {
          data: { parts: ranges.map((r, i) => ({ ...r, title: `Part ${i + 1}`, summary: "s", characters: [] })) },
          promptTokens: 1,
          cachedTokens: 0,
          completionTokens: 1,
        };
      },
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s1b", "c1s1c"]);
    const written = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
      provenance: { resplit: { splits: { from: string; at_n: number; margin: number; window_left: string; window_right: string; final_left: string | null; final_right: string | null; decided_by: string }[] } };
    };
    expect(written.provenance.resplit.splits.map((s) => [s.from, s.at_n])).toEqual([["c1s1", 3], ["c1s1", 5]]);
    expect(written.provenance.resplit.splits.map((s) => [s.final_left, s.final_right])).toEqual([["calma", "combate"], ["combate", "tristeza"]]);
    for (const entry of written.provenance.resplit.splits) {
      expect(entry.window_left).not.toBe(entry.window_right);
      expect(entry.margin).toBeGreaterThanOrEqual(0.3);
    }
  });
});
