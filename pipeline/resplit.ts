// Step: re-split scenes where the dominant emotion changes strongly
// along the text. Reads book.json and analysis.json, rewrites
// scenes.json and analysis.json. Reuses only when the recorded
// resplit input matches the current scene ranges.
// A Muse resplit failure keeps the scene whole and lands in muse_failures.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renormalize8 } from "../core/emotion";
import { countWords } from "../core/reader";
import {
  RESPLIT_ASK_MARGIN,
  RESPLIT_AUTO_MARGIN,
  buildWindows,
  isResplitCandidate,
  meanVector,
  planSplits,
  splitIds,
  topOf,
} from "../core/resplit";
import type { ResplitWindow, SplitCall } from "../core/resplit";
import { validateBookCoverage } from "../core/scenes";
import type { AnalyzedScene, Book, EmotionId, Scene, SceneEmotion } from "../core/types";
import { classifyInputOf, decide, resplitInputOf, resplitKeys } from "./freshness";
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
  at_n: number;
  margin: number;
  window_left: EmotionId;
  window_right: EmotionId;
  final_left: EmotionId | null;
  final_right: EmotionId | null;
  decided_by: "rule" | "muse";
  reason?: string;
}

export interface ResplitRejected {
  from: string;
  at_n: number;
  margin: number;
  window_left: EmotionId;
  window_right: EmotionId;
  reason: string;
}

export interface ResplitMergedBack {
  from: string;
  top: EmotionId | null;
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

export interface ResplitWindowFailure {
  from: string;
  reason: string;
}

function museFailureReason(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const reason = msg
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/www\.\S+/g, "[url]")
    .replace(/(?:bearer|api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1 [redacted]")
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return reason || "unknown-error";
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
  const keys = resplitKeys(ctx.dir);
  if (decide(ctx.force, keys.recorded, keys.current).reuse) {
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
  const windowFailures: ResplitWindowFailure[] = [];
  const museFailures: { from: string; reason: string }[] = [];
  const rejected: ResplitRejected[] = [];
  const mergedBack: ResplitMergedBack[] = [];

  const splitScenes = await runPool(candidates, 4, async (scene) => {
    const paragraphs = book.paragraphs.filter((p) => p.n >= scene.start_n && p.n <= scene.end_n);
    const spans = buildWindows(paragraphs);
    const windows: ResplitWindow[] = [];
    for (const span of spans) {
      const text = paragraphs.filter((p) => p.n >= span.startN && p.n <= span.endN).map((p) => p.text).join("\n");
      let result;
      try {
        result = await deps.jev.classify({ book: book.title, chapter: chapterTitle.get(scene.ch) ?? "", sceneTitle: scene.title, scene: text });
      } catch (err) {
        windowFailures.push({ from: scene.id, reason: museFailureReason(err) });
        return null;
      }
      usage.jevRequests += 1;
      usage.jevInputTokens += result.input_tokens;
      usage.jevOutputTokens += result.output_tokens;
      const { unknown: _dropped, ...rest } = result.vector;
      const vector = renormalize8(rest);
      if (vector === null) {
        windowFailures.push({ from: scene.id, reason: "null-vector" });
        return null;
      }
      windows.push({ ...span, vector });
      windowsClassified += 1;
    }
    if (windows.length < 2) return null;
    const taken: { call: SplitCall; by: "rule" | "muse" }[] = [];
    const reasons = new Map<number, string>();
    let cuts: number[];
    try {
      cuts = await planSplits(
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
          const reason = String(data.reason ?? "");
          if (split) reasons.set(call.index, reason);
          else rejected.push({ from: scene.id, at_n: boundaryN, margin: call.margin, window_left: call.left, window_right: call.right, reason });
          return split;
        },
        (call, by) => taken.push({ call, by }),
      );
    } catch (err) {
      museFailures.push({ from: scene.id, reason: museFailureReason(err) });
      return null;
    }
    if (cuts.length === 0) return null;
    const bounds = [0, ...cuts, windows.length];
    const ranges = bounds.slice(1).map((end, i) => ({ startN: windows[bounds[i] ?? 0]?.startN ?? 0, endN: windows[end - 1]?.endN ?? 0 }));
    let parts: { start_n: number; end_n: number; title: string; summary: string; characters: unknown }[];
    try {
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
      parts = (result.data as { parts?: { start_n: number; end_n: number; title: string; summary: string; characters: unknown }[] }).parts ?? [];
      if (parts.length !== ranges.length || parts.some((p, i) => p.start_n !== ranges[i]?.startN || p.end_n !== ranges[i]?.endN)) {
        throw new Error("titles do not cover the split ranges");
      }
    } catch (err) {
      museFailures.push({ from: scene.id, reason: museFailureReason(err) });
      return null;
    }
    const bases = parts.map((part) => ({
      ch: scene.ch,
      start_n: part.start_n,
      end_n: part.end_n,
      title: part.title,
      summary: part.summary,
      characters: Array.isArray(part.characters) ? part.characters.map(String) : [],
    }));
    const analyzed = await runPool(bases, 4, async (base) => {
      const text = paragraphs.filter((p) => p.n >= base.start_n && p.n <= base.end_n).map((p) => p.text).join("\n");
      const emotion = await classifyScene({ id: "", ...base }, text, book.title, chapterTitle.get(scene.ch) ?? "", deps, usage.meta);
      if (emotion.jev) {
        usage.jevRequests += 1;
        usage.jevInputTokens += emotion.jev.input_tokens;
        usage.jevOutputTokens += emotion.jev.output_tokens;
      }
      return emotion;
    });
    // Merge adjacent parts whose re-classified top emotion agrees; a
    // null final never merges. One extra classify per merged group.
    const tops = analyzed.map((e) => (e.final ? topOf(e.final.vector).id : null));
    const groups: number[][] = [];
    for (let i = 0; i < bases.length; i++) {
      const last = groups[groups.length - 1];
      const prev = last ? tops[last[last.length - 1] ?? -1] : undefined;
      const top = tops[i];
      if (last && top !== null && top === prev) last.push(i);
      else groups.push([i]);
    }
    if (groups.length === 1 && bases.length > 1) {
      mergedBack.push({ from: scene.id, top: tops[0] ?? null });
      return null;
    }
    const finals: { base: (typeof bases)[number]; emotion: SceneEmotion }[] = [];
    for (const group of groups) {
      if (group.length === 1) {
        const i = group[0] ?? 0;
        finals.push({ base: bases[i]!, emotion: (analyzed[i] ?? { jev: null, muse_override: null, final: null, error: "missing part emotion" }) as SceneEmotion });
        continue;
      }
      const first = bases[group[0] ?? 0]!;
      const lastBase = bases[group[group.length - 1] ?? 0]!;
      const base = { ...first, start_n: first.start_n, end_n: lastBase.end_n };
      const text = paragraphs.filter((p) => p.n >= base.start_n && p.n <= base.end_n).map((p) => p.text).join("\n");
      const emotion = await classifyScene({ id: "", ...base }, text, book.title, chapterTitle.get(scene.ch) ?? "", deps, usage.meta);
      if (emotion.jev) {
        usage.jevRequests += 1;
        usage.jevInputTokens += emotion.jev.input_tokens;
        usage.jevOutputTokens += emotion.jev.output_tokens;
      }
      finals.push({ base, emotion });
      mergedBack.push({ from: scene.id, top: emotion.final ? topOf(emotion.final.vector).id : null });
    }
    const ids = splitIds(scene.id, finals.length);
    const byCut = new Map(taken.map((t) => [t.call.index, t]));
    const finalTops = finals.map((f) => (f.emotion.final ? topOf(f.emotion.final.vector).id : null));
    // One entry per surviving cut; the window tops picked the cut and
    // the final tops are what the stored parts re-classified to.
    const entries: ResplitEntry[] = [];
    let start = 0;
    for (let g = 0; g + 1 < groups.length; g++) {
      const end = start + (groups[g]?.length ?? 0);
      const cutIndex = bounds[end] ?? 0;
      const call = byCut.get(cutIndex);
      const reason = reasons.get(cutIndex);
      entries.push({
        from: scene.id,
        at_n: finals[g + 1]?.base.start_n ?? 0,
        margin: call?.call.margin ?? 0,
        window_left: call?.call.left ?? "calma",
        window_right: call?.call.right ?? "calma",
        final_left: finalTops[g] ?? null,
        final_right: finalTops[g + 1] ?? null,
        decided_by: call?.by ?? "rule",
        ...(reason ? { reason } : {}),
      });
      start = end;
    }
    return {
      scene,
      parts: finals.map((f, i) => ({
        scene: { id: ids[i] ?? "", ...f.base } satisfies Scene,
        emotion: f.emotion,
      })),
      entries,
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
    entries.push(...split.entries);
    for (const part of split.parts) scenes.push({ ...part.scene, ...part.emotion });
  }
  scenes.sort((a, b) => a.start_n - b.start_n);
  const seen = new Set<string>();
  for (const s of scenes) {
    if (seen.has(s.id)) throw new Error(`resplit minted duplicate scene id ${s.id}`);
    seen.add(s.id);
  }
  const problems = validateBookCoverage(book, scenes);
  if (problems.length > 0) throw new Error(`resplit breaks coverage: ${problems.map((p) => p.message).join("; ")}`);

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
  const resplitWrote = resplitInputOf(scenes, book.textVersion);
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
        input: classifyInputOf(scenes, book.textVersion),
        resplit: {
          input: resplitWrote,
          auto_margin: RESPLIT_AUTO_MARGIN,
          ask_margin: RESPLIT_ASK_MARGIN,
          candidates: candidates.length,
          windows_classified: windowsClassified,
          splits: entries,
          merged_back: mergedBack,
          rejected: rejected,
          window_failures: windowFailures,
          muse_failures: museFailures,
          jev: { model: deps.jev.model, requests: usage.jevRequests, input_tokens: usage.jevInputTokens, output_tokens: usage.jevOutputTokens, cost_usd: jevCost },
          meta: { model: usage.meta.model, requests: usage.meta.requests, prompt_tokens: usage.meta.promptTokens, cached_tokens: usage.meta.cachedTokens, completion_tokens: usage.meta.completionTokens, cost_usd: usage.meta.costUsd },
        },
      },
    })}\n`,
  );
  return scenes;
}
