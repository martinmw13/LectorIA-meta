import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyzedScene } from "../core/types";
import type { JevClient } from "./jev";
import type { MetaClient } from "./meta";
import { museFailureReason, runResplit } from "./resplit";
import { V, jevResult, para, setupDir } from "./resplit.fixtures";

function titlesFrom(user: string, prefix: string) {
  const ranges = [...user.matchAll(/PART \d+ \[(\d+)\.\.(\d+)\]/g)].map((m) => ({ start_n: Number(m[1]), end_n: Number(m[2]) }));
  return { data: { parts: ranges.map((r, i) => ({ ...r, title: `${prefix} ${i + 1}`, summary: "s", characters: [] })) }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 };
}

function readResplit(dir: string) {
  return (JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as {
    provenance: {
      resplit: {
        splits: unknown[];
        merged_back: unknown[];
        rejected: unknown[];
        window_failures: unknown;
        muse_failures: unknown;
        reclassify_failures: unknown;
        windows_classified: number;
        jev: { requests: number };
        meta: { requests: number };
      };
    };
  }).provenance.resplit;
}

describe("runResplit null-final parts", () => {
  it("keeps the scene whole when one part re-classifies to null", async () => {
    const dir = setupDir();
    const before = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as { scenes: AnalyzedScene[] };
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ sceneTitle, scene }) => {
        if (sceneTitle === "Part 2") throw new Error("part jev down");
        const marker = ["meadow", "storm", "uneasy", "tense", "quiet"].find((m) => scene.includes(m)) ?? "quiet";
        const vector = V[marker];
        if (!vector) throw new Error(`no fake vector for ${marker}`);
        return jevResult(vector, marker === "storm" || marker === "tense" ? "combate" : "calma");
      },
    };
    const meta: MetaClient = {
      model: "meta-test",
      completeJson: async ({ schemaName, user }) => {
        if (schemaName === "resplit_decision") return { data: { split: false, reason: "Just a blend." }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 };
        return titlesFrom(user, "Part");
      },
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s2", "c1s3"]);
    expect(scenes).toEqual(before.scenes);
    const resplit = readResplit(dir);
    expect(resplit.splits).toEqual([]);
    expect(resplit.merged_back).toEqual([]);
    expect(resplit.reclassify_failures).toEqual([{ from: "c1s1", reason: "null-final" }]);
    expect(resplit.jev.requests).toBe(5);
    expect(resplit.meta.requests).toBe(2);
  });

  it("records each failure kind in its own list and leaves scenes unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "resplit-"));
    const paragraphs = [
      para(1, "meadow"), para(2, "meadow"), para(3, "storm"), para(4, "storm"),
      para(5, "uneasy"), para(6, "uneasy"), para(7, "tense"), para(8, "tense"),
      para(9, "meadow"), para(10, "meadow"), para(11, "storm"), para(12, "storm"),
    ];
    writeFileSync(
      join(dir, "book.json"),
      JSON.stringify({ id: "oz", title: "Oz", author: "A", source: { gutenberg: 55, url: "u" }, textVersion: "sha256:x", chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 12 }], paragraphs }),
    );
    const sceneFile = (id: string, start_n: number, end_n: number, vector: Record<string, number>) => ({
      id, ch: 1, start_n, end_n, title: id, summary: "s", characters: [],
      jev: null, muse_override: null, final: { vector, intensity: 0.5, tempo: 0.5 }, error: null,
    });
    const mixed = { calma: 0.55, tristeza: 0.45, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 };
    const unsure = { calma: 0.4, combate: 0.35, tristeza: 0.25, alegria: 0, suspenso: 0, misterio: 0, aventura: 0, asombro: 0 };
    writeFileSync(
      join(dir, "scenes.json"),
      JSON.stringify({
        bookId: "oz", textVersion: "sha256:x",
        scenes: [
          { id: "c1s1", ch: 1, start_n: 1, end_n: 4, title: "c1s1", summary: "s", characters: [] },
          { id: "c1s2", ch: 1, start_n: 5, end_n: 8, title: "c1s2", summary: "s", characters: [] },
          { id: "c1s3", ch: 1, start_n: 9, end_n: 12, title: "c1s3", summary: "s", characters: [] },
        ],
        provenance: { date: "d", meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 } },
      }),
    );
    writeFileSync(
      join(dir, "analysis.json"),
      JSON.stringify({
        bookId: "oz", textVersion: "sha256:x",
        scenes: [sceneFile("c1s1", 1, 4, mixed), sceneFile("c1s2", 5, 8, unsure), sceneFile("c1s3", 9, 12, mixed)],
        override_rate: 0,
        provenance: {
          date: "d",
          jev: { model: "jev-1.14.0", requests: 3, input_tokens: 300, output_tokens: 30, cost_usd: 0.0001 },
          meta: { model: "m", requests: 1, prompt_tokens: 1000, cached_tokens: 0, completion_tokens: 50, cost_usd: 0.001 },
          total_cost_usd: 0.0011,
        },
      }),
    );
    const before = JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) as { scenes: AnalyzedScene[] };
    const jev: JevClient = {
      model: "jev-1.14.0",
      classify: async ({ sceneTitle, scene }) => {
        if (sceneTitle === "c1s1" && scene.includes("storm")) throw new Error("jev down");
        if (sceneTitle === "CPart 2") throw new Error("part jev down");
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
          if (user.includes('Scene "c1s2"')) throw new Error("decision down");
          return { data: { split: true, reason: "Mood shifts and stays." }, promptTokens: 1, cachedTokens: 0, completionTokens: 1 };
        }
        return titlesFrom(user, user.includes("(c1s3") ? "CPart" : "Part");
      },
    };
    const scenes = await runResplit({ bookKey: "oz", force: true, dir }, { jev, meta });
    expect(scenes.map((s) => s.id)).toEqual(["c1s1", "c1s2", "c1s3"]);
    expect(scenes).toEqual(before.scenes);
    const resplit = readResplit(dir);
    expect(resplit.splits).toEqual([]);
    expect(resplit.merged_back).toEqual([]);
    expect(resplit.window_failures).toEqual([{ from: "c1s1", reason: "jev down" }]);
    expect(resplit.muse_failures).toEqual([{ from: "c1s2", reason: "decision down" }]);
    expect(resplit.reclassify_failures).toEqual([{ from: "c1s3", reason: "null-final" }]);
  });
});

describe("museFailureReason", () => {
  it("replaces urls with [url]", () => {
    const out = museFailureReason(new Error("fetch failed https://example.com/path?q=1, see www.example.org/docs"));
    expect(out).toContain("[url]");
    expect(out).not.toContain("example.com");
    expect(out).not.toContain("example.org");
  });

  it("redacts credential assignments", () => {
    expect(museFailureReason(new Error("call failed api_key=demo-value end"))).toBe("call failed api_key [redacted] end");
    expect(museFailureReason(new Error("denied Bearer: faketoken1 retry"))).toBe("denied Bearer [redacted] retry");
    expect(museFailureReason(new Error("bad token=demo-abc done"))).toBe("bad token [redacted] done");
    expect(museFailureReason(new Error("login failed password: demo-pass locked"))).toBe("login failed password [redacted] locked");
  });

  it("redacts long token-like runs, collapses whitespace, and caps length", () => {
    const run = "abcdefghij0123456789ABCD";
    const out = museFailureReason(new Error(`trace ${run} done`));
    expect(out).toContain("[redacted]");
    expect(out).not.toContain(run);
    expect(museFailureReason(new Error("a   b\n\tc"))).toBe("a b c");
    expect(museFailureReason("word ".repeat(200))).toHaveLength(200);
  });

  it("handles empty and non-Error values", () => {
    expect(museFailureReason(new Error(""))).toBe("unknown-error");
    expect(museFailureReason("boom")).toBe("boom");
    expect(museFailureReason(undefined)).toBe("undefined");
  });
});
