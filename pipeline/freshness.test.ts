import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runClassify } from "./classify";
import { runCluster } from "./cluster-tracks";
import {
  classifyInputOf,
  classifyKeys,
  clusterInputOf,
  clusterKeys,
  decide,
  fingerprint,
  planSteps,
  resplitInputOf,
  resplitKeys,
  segmentKeys,
} from "./freshness";
import type { JevClient } from "./jev";
import type { MetaClient } from "./meta";
import { runResplit } from "./resplit";
import { runSegment } from "./segment";

// Tiny book: one chapter, four short paragraphs. Scenes stay far under
// the resplit word floor, so resplit never calls a client here.
function setupBook(dir: string): void {
  writeFileSync(
    join(dir, "book.json"),
    JSON.stringify({
      id: "oz",
      title: "Oz",
      author: "A",
      source: { gutenberg: 55, url: "u" },
      textVersion: "sha256:x",
      chapters: [{ ch: 1, title: "One", start_n: 1, end_n: 4 }],
      paragraphs: [1, 2, 3, 4].map((n) => ({ id: `c1p${n}`, ch: 1, n, text: `short paragraph ${n}` })),
    }),
  );
}

function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "freshness-"));
  setupBook(dir);
  return dir;
}

function segmentFake(parts: [number, number][]): MetaClient {
  return {
    model: "meta-test",
    completeJson: async () => ({
      data: {
        scenes: parts.map(([start_n, end_n], i) => ({ start_n, end_n, title: `Part ${i + 1}`, summary: "s", characters: [] })),
      },
      promptTokens: 10,
      cachedTokens: 0,
      completionTokens: 5,
    }),
  };
}

function jevOk(): JevClient {
  return {
    model: "jev-1.14.0",
    classify: async () => ({
      vector: { calma: 0, alegria: 0, tristeza: 0, suspenso: 0.1, misterio: 0, aventura: 0, combate: 0.9, asombro: 0, unknown: 0 },
      choice: "combate",
      confidence: 0.9,
      intensity: 0.5,
      intensity_confidence: 0.9,
      tempo: 0.5,
      tempo_confidence: 0.9,
      model: "jev-1.14.0",
      input_tokens: 100,
      output_tokens: 10,
    }),
  };
}

const throwJev: JevClient = {
  model: "never",
  classify: async () => {
    throw new Error("client called on a fresh step");
  },
};

const throwMeta: MetaClient = {
  model: "never",
  completeJson: async () => {
    throw new Error("client called on a fresh step");
  },
};

function readJson(dir: string, name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
}

describe("fingerprint", () => {
  it("is a deterministic 16-char hex string that moves with the input", () => {
    expect(fingerprint({ a: 1 })).toBe(fingerprint({ a: 1 }));
    expect(fingerprint({ a: 1 })).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });
});

describe("decide", () => {
  it("reuses only when not forced and the keys match", () => {
    expect(decide(true, "x", "x")).toEqual({ reuse: false, reason: "forced" });
    expect(decide(true, undefined, "x")).toEqual({ reuse: false, reason: "forced" });
    expect(decide(false, undefined, "x")).toEqual({ reuse: false, reason: "no previous output" });
    expect(decide(false, "x", "y")).toEqual({ reuse: false, reason: "inputs changed" });
    expect(decide(false, "x", "x")).toEqual({ reuse: true, reason: "inputs unchanged" });
  });
});

describe("step keys", () => {
  it("reports redo when files or fields are missing", () => {
    const dir = setupDir();
    expect(segmentKeys(dir)).toEqual({ recorded: undefined, current: "sha256:x" });
    expect(classifyKeys(dir).recorded).toBeUndefined();
    expect(resplitKeys(dir).recorded).toBeUndefined();
    expect(clusterKeys(dir).recorded).toBeUndefined();
  });
});

describe("planSteps", () => {
  it("cascades an upstream redo onto every later selected step", () => {
    const dir = setupDir();
    expect(planSteps(dir, ["segment", "classify", "resplit", "cluster"], false)).toEqual([
      { step: "segment", reuse: false, reason: "no previous output" },
      { step: "classify", reuse: false, reason: "upstream step redoes" },
      { step: "resplit", reuse: false, reason: "upstream step redoes" },
      { step: "cluster", reuse: false, reason: "upstream step redoes" },
    ]);
  });
});

describe("the force sequence", () => {
  it("segment change redoes classify, classify drops the stale resplit, resplit re-covers", async () => {
    const dir = setupDir();
    await runSegment({ bookKey: "oz", force: true, dir }, { meta: segmentFake([[1, 4]]) });
    await runClassify({ bookKey: "oz", force: true, dir }, { jev: jevOk(), meta: throwMeta });
    await runResplit({ bookKey: "oz", force: true, dir }, { jev: throwJev, meta: throwMeta });
    await runCluster({ bookKey: "oz", force: true, dir });

    // New boundaries, then classify without force: the scenes changed,
    // so classify must redo instead of reusing the old analysis.
    await runSegment({ bookKey: "oz", force: true, dir }, { meta: segmentFake([[1, 2], [3, 4]]) });
    let jevCalls = 0;
    const countingJev: JevClient = {
      model: "jev-1.14.0",
      classify: async (input) => {
        jevCalls += 1;
        return jevOk().classify(input);
      },
    };
    const scenes = await runClassify({ bookKey: "oz", force: false, dir }, { jev: countingJev, meta: throwMeta });
    expect(jevCalls).toBe(2);
    expect(scenes.map((s) => [s.start_n, s.end_n])).toEqual([[1, 2], [3, 4]]);

    // The old resplit record described the single old scene, so it is gone.
    const analysis = readJson(dir, "analysis.json");
    expect((analysis.provenance as Record<string, unknown>).resplit).toBeUndefined();
    expect((analysis.provenance as Record<string, unknown>).input).toBe(classifyInputOf(scenes, readJson(dir, "book.json").textVersion));

    // Resplit must not skip: no record matches the new ranges, so it
    // runs and writes a record for exactly these ranges.
    await runResplit({ bookKey: "oz", force: false, dir }, { jev: throwJev, meta: throwMeta });
    const after = readJson(dir, "analysis.json");
    const resplit = (after.provenance as Record<string, Record<string, unknown> | undefined>).resplit;
    if (!resplit) throw new Error("resplit ran but wrote no record");
    expect(resplit.input).toBe(resplitInputOf(after.scenes as { id: unknown; start_n: unknown; end_n: unknown }[], readJson(dir, "book.json").textVersion));

    // Rerunning resplit on its own output reuses: same scenes, same bytes.
    const bytes = readFileSync(join(dir, "analysis.json"), "utf8");
    const again = await runResplit({ bookKey: "oz", force: false, dir }, { jev: throwJev, meta: throwMeta });
    expect(again.map((s) => s.id)).toEqual((after.scenes as { id: string }[]).map((s) => s.id));
    expect(readFileSync(join(dir, "analysis.json"), "utf8")).toBe(bytes);
  });

  it("cluster redoes when finals change and reuses otherwise", async () => {
    const dir = setupDir();
    await runSegment({ bookKey: "oz", force: true, dir }, { meta: segmentFake([[1, 2], [3, 4]]) });
    await runClassify({ bookKey: "oz", force: true, dir }, { jev: jevOk(), meta: throwMeta });
    await runCluster({ bookKey: "oz", force: true, dir });
    const first = readFileSync(join(dir, "music-clusters.json"), "utf8");

    await runCluster({ bookKey: "oz", force: false, dir });
    expect(readFileSync(join(dir, "music-clusters.json"), "utf8")).toBe(first);

    const analysis = readJson(dir, "analysis.json");
    const list = analysis.scenes as { id: string; final: { vector: Record<string, number> } | null }[];
    const target = list.find((s) => s.final !== null);
    if (!target?.final) throw new Error("fixture needs a classified scene");
    target.final.vector = { calma: 0.9, alegria: 0.1, tristeza: 0, suspenso: 0, misterio: 0, aventura: 0, combate: 0, asombro: 0 };
    writeFileSync(join(dir, "analysis.json"), `${JSON.stringify({ ...analysis, scenes: list })}\n`);

    await runCluster({ bookKey: "oz", force: false, dir });
    const second = readFileSync(join(dir, "music-clusters.json"), "utf8");
    expect(second).not.toBe(first);
    expect((readJson(dir, "music-clusters.json").provenance as Record<string, unknown>).input).toBe(
      clusterInputOf(list as { id: unknown; final: unknown }[]),
    );

    await runCluster({ bookKey: "oz", force: false, dir });
    expect(readFileSync(join(dir, "music-clusters.json"), "utf8")).toBe(second);
  });
});

describe("changed textVersion", () => {
  it("redoes classify and resplit when the scenes are identical", async () => {
    const dir = setupDir();
    await runSegment({ bookKey: "oz", force: true, dir }, { meta: segmentFake([[1, 4]]) });
    await runClassify({ bookKey: "oz", force: true, dir }, { jev: jevOk(), meta: throwMeta });
    await runResplit({ bookKey: "oz", force: true, dir }, { jev: throwJev, meta: throwMeta });
    const stamped = readJson(dir, "analysis.json");
    const oldInput = (stamped.provenance as Record<string, unknown>).input;
    const oldResplit = ((stamped.provenance as Record<string, unknown>).resplit as Record<string, unknown>).input;

    // Corrected book text, same scene boundaries: segment rewrites
    // the same scene under the new textVersion.
    const book = readJson(dir, "book.json");
    writeFileSync(join(dir, "book.json"), JSON.stringify({ ...book, textVersion: "sha256:y" }));
    await runSegment({ bookKey: "oz", force: false, dir }, { meta: segmentFake([[1, 4]]) });
    expect((readJson(dir, "scenes.json").scenes as unknown[]).length).toBe(1);

    // Classify must redo: with text out of the key this would reuse
    // and never call Jev.
    let jevCalls = 0;
    const countingJev: JevClient = {
      model: "jev-1.14.0",
      classify: async (input) => {
        jevCalls += 1;
        return jevOk().classify(input);
      },
    };
    await runClassify({ bookKey: "oz", force: false, dir }, { jev: countingJev, meta: throwMeta });
    expect(jevCalls).toBe(1);

    const afterClassify = readJson(dir, "analysis.json");
    expect((afterClassify.provenance as Record<string, unknown>).input).not.toBe(oldInput);
    expect((afterClassify.provenance as Record<string, unknown>).resplit).toBeUndefined();

    await runResplit({ bookKey: "oz", force: false, dir }, { jev: throwJev, meta: throwMeta });
    const afterResplit = readJson(dir, "analysis.json");
    expect(((afterResplit.provenance as Record<string, unknown>).resplit as Record<string, unknown>).input).not.toBe(oldResplit);
  });
});

describe("full unforced rerun", () => {
  it("reuses every step and calls no client", async () => {
    const dir = setupDir();
    await runSegment({ bookKey: "oz", force: true, dir }, { meta: segmentFake([[1, 4]]) });
    await runClassify({ bookKey: "oz", force: true, dir }, { jev: jevOk(), meta: throwMeta });
    await runResplit({ bookKey: "oz", force: true, dir }, { jev: throwJev, meta: throwMeta });
    await runCluster({ bookKey: "oz", force: true, dir });
    const before = ["book.json", "scenes.json", "analysis.json", "music-clusters.json"].map((name) =>
      readFileSync(join(dir, name), "utf8"),
    );

    await runSegment({ bookKey: "oz", force: false, dir }, { meta: throwMeta });
    await runClassify({ bookKey: "oz", force: false, dir }, { jev: throwJev, meta: throwMeta });
    await runResplit({ bookKey: "oz", force: false, dir }, { jev: throwJev, meta: throwMeta });
    await runCluster({ bookKey: "oz", force: false, dir });

    expect(["book.json", "scenes.json", "analysis.json", "music-clusters.json"].map((name) => readFileSync(join(dir, name), "utf8"))).toEqual(
      before,
    );
  });
});

describe("stamped oz data", () => {
  it("planSteps reuses every step", () => {
    expect(planSteps(join("data", "books", "oz"), ["segment", "classify", "resplit", "cluster"], false)).toEqual([
      { step: "segment", reuse: true, reason: "inputs unchanged" },
      { step: "classify", reuse: true, reason: "inputs unchanged" },
      { step: "resplit", reuse: true, reason: "inputs unchanged" },
      { step: "cluster", reuse: true, reason: "inputs unchanged" },
    ]);
  });
});
