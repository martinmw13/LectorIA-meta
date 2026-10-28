import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { JevClient } from "./jev";
import type { MetaClient } from "./meta";
import { runResplit } from "./resplit";
import { V, jevResult, setupDir } from "./resplit.fixtures";

describe("runResplit window failures", () => {
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
      provenance: { resplit: { splits: unknown[]; window_failures: { from: string; reason: string }[] } };
    };
    expect(written.provenance.resplit.splits).toEqual([]);
    expect(written.provenance.resplit.window_failures).toEqual([{ from: "c1s1", reason: "jev down" }]);
  });

  it("records a null-vector reason when a window Jev vector renormalizes to null", async () => {
    const dir = setupDir();
    const zero = { calma: 0, alegria: 0, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0, unknown: 0 };
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ scene }) => {
        if (scene.includes("storm")) return jevResult(zero, "calma");
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
      provenance: { resplit: { splits: unknown[]; window_failures: { from: string; reason: string }[] } };
    };
    expect(written.provenance.resplit.splits).toEqual([]);
    expect(written.provenance.resplit.window_failures).toEqual([{ from: "c1s1", reason: "null-vector" }]);
  });
});
