// Step: re-split scenes where the dominant emotion changes strongly
// along the text. Reads book.json and analysis.json, rewrites
// scenes.json and analysis.json. Skips when provenance.resplit exists.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renormalize8 } from "../core/emotion";
import { countWords } from "../core/reader";
import {
  RESPLIT_ASK_MARGIN,
  RESPLIT_AUTO_MARGIN,
  bestBoundary,
  buildWindows,
  isResplitCandidate,
  meanVector,
  planSplits,
  splitIds,
} from "../core/resplit";
import type { ResplitWindow, SplitCall } from "../core/resplit";
import { validateBookCoverage } from "../core/scenes";
import type { AnalyzedScene, Book, EmotionId, Scene, SceneEmotion } from "../core/types";
import { classifyScene } from "./classify";
import type { ClassifyMetaUsage } from "./classify";
import type { StepCtx } from "./ingest";
import { runPool } from "./http";
import type { JevClient } from "./jev";
import type { MetaClient } from "./meta";
import { jevCostUsd, metaCostUsd } from "./prices";

const DECISION_SCHEMA = {
  type: "object",
  properties: { split: { type: "boolean" }, reason: { type: "string" } },
  required: ["split", "reason"],
  additionalProperties: false,
};

const TITLES_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start_n: { type: "number" },
          end_n: { type: "number" },
          title: { type: "string" },
          summary: { type: "string" },
          characters: { type: "array", items: { type: "string" } },
        },
        required: ["start_n", "end_n", "title", "summary", "characters"],
        additionalProperties: false,
      },
    },
  },
  required: ["parts"],
  additionalProperties: false,
};

export interface ResplitEntry {
  from: string;
  into: string[];
  at_n: number[];
  margin: number;
  left: EmotionId;
  right: EmotionId;
  decided_by: "rule" | "muse";
  reason?: string;
}

interface Usage {
  jevRequests: number;
  jevInputTokens: number;
  jevOutputTokens: number;
  meta: ClassifyMetaUsage;
}

function newUsage(model: string): Usage {
  return { jevRequests: 0, jevInputTokens: 0, jevOutputTokens: 0, meta: { model, requests: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 } };
}

function trackMeta(usage: Usage, result: { promptTokens: number; cachedTokens: number; completionTokens: number }): void {
  usage.meta.requests += 1;
  usage.meta.promptTokens += result.promptTokens;
  usage.meta.cachedTokens += result.cachedTokens;
  usage.meta.completionTokens += result.completionTokens;
}

export async function runResplit(ctx: StepCtx, deps: { jev: JevClient; meta: MetaClient }): Promise<AnalyzedScene[]> {
  const book = JSON.parse(readFileSync(join(ctx.dir, "book.json"), "utf8")) as Book;
  const scenesFile = JSON.parse(readFileSync(join(ctx.dir, "scenes.json"), "utf8")) as {
    bookId: string;
    textVersion: string;
    scenes: Scene[];
    provenance: { meta: { model: string; requests: number; prompt_tokens: number; cached_tokens: number; completion_tokens: number; cost_usd: number } };
  };
  const analysisFile = JSON.parse(readFileSync(join(ctx.dir, "analysis.json"), "utf8")) as {
    bookId: string;
    textVersion: string;
    scenes: AnalyzedScene[];
    provenance: {
      date: string;
      jev: { model: string; requests: number; input_tokens: number; output_tokens: number; cost_usd: number };
      meta: { model: string; requests: number; prompt_tokens: number; cached_tokens: number; completion_tokens: number; cost_usd: number };
      total_cost_usd: number;
      resplit?: unknown;
    };
  };
  if (!ctx.force && analysisFile.textVersion === book.textVersion && analysisFile.provenance.resplit) {
    return analysisFile.scenes;
  }
  const usage = newUsage(deps.meta.model);
  const byN = new Map(book.paragraphs.map((p) => [p.n, p.text]));
  const chapterTitle = new Map(book.chapters.map((c) => [c.ch, c.title]));
  const wordsOf = (scene: { start_n: number; end_n: number }): number => {
    let words = 0;
    for (let n = scene.start_n; n <= scene.end_n; n++) words += countWords(byN.get(n) ?? "");
    return words;
  };
  const candidates = analysisFile.scenes.filter((s) => isResplitCandidate(wordsOf(s), s.final));
  let windowsClassified = 0;

  const splitScenes = await runPool(candidates, 4, async (scene) => {
    const paragraphs = book.paragraphs.filter((p) => p.n >= scene.start_n && p.n <= scene.end_n);
    const spans = buildWindows(paragraphs);
    const windows: ResplitWindow[] = [];
    for (const span of spans) {
      const text = paragraphs.filter((p) => p.n >= span.startN && p.n <= span.endN).map((p) => p.text).join("\n");
      const result = await deps.jev.classify({ book: book.title, chapter: chapterTitle.get(scene.ch) ?? "", sceneTitle: scene.title, scene: text });
      usage.jevRequests += 1;
      usage.jevInputTokens += result.input_tokens;
      usage.jevOutputTokens += result.output_tokens;
      const { unknown: _dropped, ...rest } = result.vector;
      const vector = renormalize8(rest);
      if (vector === null) return null;
      windows.push({ ...span, vector });
      windowsClassified += 1;
    }
    if (windows.length < 2) return null;
    const taken: { call: SplitCall; by: "rule" | "muse"; reason?: string }[] = [];
    const cuts = await planSplits(
      windows,
      async (call) => {
        const boundaryN = windows[call.index]?.startN ?? 0;
        const before = paragraphs.filter((p) => p.n < boundaryN).slice(-2);
        const after = paragraphs.filter((p) => p.n >= boundaryN).slice(0, 2);
        const left = meanVector(windows.slice(0, call.index));
        const right = meanVector(windows.slice(call.index));
        const result = await deps.meta.completeJson({
          system: "You judge whether a scene needs two music tracks. Answer with JSON only.",
          user:
            `Scene "${scene.title}" may change mood at paragraph ${windows[call.index]?.startN}. ` +
            `Left mood ${call.left} ${JSON.stringify(left)}, right mood ${call.right} ${JSON.stringify(right)}. ` +
            `Split only when the dominant feeling changes strongly and stays changed, not for a mixed blend. ` +
            `Before: ${before.map((p) => `[${p.n}] ${p.text}`).join("\n")}\nAfter: ${after.map((p) => `[${p.n}] ${p.text}`).join("\n")}`,
          schemaName: "resplit_decision",
          schema: DECISION_SCHEMA,
        });
        trackMeta(usage, result);
        const data = result.data as { split?: unknown; reason?: unknown };
        const split = data.split === true;
        if (split) taken.push({ call, by: "muse", reason: String(data.reason ?? "") });
        return split;
      },
      (call) => taken.push({ call, by: "rule" }),
    );
    if (cuts.length === 0) return null;
    const bounds = [0, ...cuts, windows.length];
    const ranges = bounds.slice(1).map((end, i) => ({ startN: windows[bounds[i] ?? 0]?.startN ?? 0, endN: windows[end - 1]?.endN ?? 0 }));
    const result = await deps.meta.completeJson({
      system: "You split a book scene into ordered parts. Answer with JSON only, English titles in the style of the existing scene titles.",
      user:
        `Scene "${scene.title}" (${scene.id}, summary: ${scene.summary}) splits into ${ranges.length} parts. ` +
        `Give each part start_n, end_n, title, summary, and characters.\n` +
        ranges.map((r, i) => `PART ${i + 1} [${r.startN}..${r.endN}]:\n${paragraphs.filter((p) => p.n >= r.startN && p.n <= r.endN).map((p) => `[${p.n}] ${p.text}`).join("\n")}`).join("\n"),
      schemaName: "resplit_titles",
      schema: TITLES_SCHEMA,
    });
    trackMeta(usage, result);
    const parts = (result.data as { parts?: { start_n: number; end_n: number; title: string; summary: string; characters: unknown }[] }).parts ?? [];
    if (parts.length !== ranges.length || parts.some((p, i) => p.start_n !== ranges[i]?.startN || p.end_n !== ranges[i]?.endN)) {
      throw new Error(`scene ${scene.id} titles do not cover the split ranges`);
    }
    const ids = splitIds(scene.id, parts.length);
    const analyzed = await runPool(parts, 4, async (part, i) => {
      const text = paragraphs.filter((p) => p.n >= part.start_n && p.n <= part.end_n).map((p) => p.text).join("\n");
      const emotion = await classifyScene(
        { id: ids[i] ?? "", ch: scene.ch, start_n: part.start_n, end_n: part.end_n, title: part.title, summary: part.summary, characters: Array.isArray(part.characters) ? part.characters.map(String) : [] },
        text,
        book.title,
        chapterTitle.get(scene.ch) ?? "",
        deps,
        usage.meta,
      );
      usage.jevRequests += 1;
      if (emotion.jev) {
        usage.jevInputTokens += emotion.jev.input_tokens;
        usage.jevOutputTokens += emotion.jev.output_tokens;
      }
      return emotion;
    });
    const first = taken[0]?.call ?? bestBoundary(windows);
    const reason = taken.find((t) => t.reason)?.reason;
    return {
      scene,
      parts: parts.map((part, i) => ({
        scene: {
          id: ids[i] ?? "",
          ch: scene.ch,
          start_n: part.start_n,
          end_n: part.end_n,
          title: part.title,
          summary: part.summary,
          characters: Array.isArray(part.characters) ? part.characters.map(String) : [],
        } satisfies Scene,
        emotion: (analyzed[i] ?? { jev: null, muse_override: null, final: null, error: "missing part emotion" }) as SceneEmotion,
      })),
      entry: {
        from: scene.id,
        into: ids,
        at_n: ranges.map((r) => r.startN),
        margin: first?.margin ?? 0,
        left: first?.left ?? "calma",
        right: first?.right ?? "calma",
        decided_by: taken.some((t) => t.by === "muse") ? ("muse" as const) : ("rule" as const),
        ...(reason ? { reason } : {}),
      } satisfies ResplitEntry,
    };
  });

  const byId = new Map(splitScenes.filter((s) => s !== null).map((s) => [s.scene.id, s]));
  const scenes: AnalyzedScene[] = [];
  const entries: ResplitEntry[] = [];
  for (const old of analysisFile.scenes) {
    const split = byId.get(old.id);
    if (!split) {
      scenes.push(old);
      continue;
    }
    entries.push(split.entry);
    for (const part of split.parts) scenes.push({ ...part.scene, ...part.emotion });
  }
  scenes.sort((a, b) => a.start_n - b.start_n);
  const problems = validateBookCoverage(book, scenes);
  if (problems.length > 0) throw new Error(`resplit breaks coverage: ${problems.map((p) => p.message).join("; ")}`);

  const runningCost = jevCostUsd(usage.jevInputTokens) + metaCostUsd({ prompt: usage.meta.promptTokens, cached: usage.meta.cachedTokens, completion: usage.meta.completionTokens });
  if (runningCost > 0.5) throw new Error(`resplit cost $${runningCost.toFixed(2)} passed the $0.50 stop line`);
  usage.meta.costUsd = metaCostUsd({ prompt: usage.meta.promptTokens, cached: usage.meta.cachedTokens, completion: usage.meta.completionTokens });
  const jevCost = jevCostUsd(usage.jevInputTokens);
  const prevJev = analysisFile.provenance.jev;
  const prevMeta = analysisFile.provenance.meta;
  const segmentMeta = scenesFile.provenance.meta;
  writeFileSync(
    join(ctx.dir, "scenes.json"),
    `${JSON.stringify({
      bookId: book.id,
      textVersion: book.textVersion,
      scenes: scenes.map(({ id, ch, start_n, end_n, title, summary, characters }) => ({ id, ch, start_n, end_n, title, summary, characters })),
      provenance: {
        date: new Date().toISOString(),
        meta: {
          model: segmentMeta.model,
          requests: segmentMeta.requests + usage.meta.requests,
          prompt_tokens: segmentMeta.prompt_tokens + usage.meta.promptTokens,
          cached_tokens: segmentMeta.cached_tokens + usage.meta.cachedTokens,
          completion_tokens: segmentMeta.completion_tokens + usage.meta.completionTokens,
          cost_usd: segmentMeta.cost_usd + usage.meta.costUsd,
        },
      },
    })}\n`,
  );
  const totalJev = { model: deps.jev.model, requests: prevJev.requests + usage.jevRequests, input_tokens: prevJev.input_tokens + usage.jevInputTokens, output_tokens: prevJev.output_tokens + usage.jevOutputTokens, cost_usd: prevJev.cost_usd + jevCost };
  const totalMeta = {
    model: prevMeta.model,
    requests: prevMeta.requests + usage.meta.requests,
    prompt_tokens: prevMeta.prompt_tokens + usage.meta.promptTokens,
    cached_tokens: prevMeta.cached_tokens + usage.meta.cachedTokens,
    completion_tokens: prevMeta.completion_tokens + usage.meta.completionTokens,
    cost_usd: prevMeta.cost_usd + usage.meta.costUsd,
  };
  const overrides = scenes.filter((s) => s.muse_override !== null).length;
  writeFileSync(
    join(ctx.dir, "analysis.json"),
    `${JSON.stringify({
      bookId: book.id,
      textVersion: book.textVersion,
      scenes,
      override_rate: scenes.length > 0 ? overrides / scenes.length : 0,
      provenance: {
        date: new Date().toISOString(),
        jev: totalJev,
        meta: totalMeta,
        total_cost_usd: totalJev.cost_usd + totalMeta.cost_usd,
        resplit: {
          auto_margin: RESPLIT_AUTO_MARGIN,
          ask_margin: RESPLIT_ASK_MARGIN,
          candidates: candidates.length,
          windows_classified: windowsClassified,
          splits: entries,
          jev: { model: deps.jev.model, requests: usage.jevRequests, input_tokens: usage.jevInputTokens, output_tokens: usage.jevOutputTokens, cost_usd: jevCost },
          meta: { model: usage.meta.model, requests: usage.meta.requests, prompt_tokens: usage.meta.promptTokens, cached_tokens: usage.meta.cachedTokens, completion_tokens: usage.meta.completionTokens, cost_usd: usage.meta.costUsd },
        },
      },
    })}\n`,
  );
  return scenes;
}
