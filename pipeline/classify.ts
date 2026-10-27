// Step 3: one Jev call per scene, Meta override on low confidence.
// Hard failures record the error and continue; they never invent a vector.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMOTIONS } from "../core/types";
import type { AnalyzedScene, Book, EmotionId, Scene, SceneEmotion } from "../core/types";
import { jevFinal, needsOverride, renormalize8 } from "../core/emotion";
import { readIfFresh } from "./cache";
import type { StepCtx } from "./ingest";
import { runPool } from "./http";
import type { JevClient } from "./jev";
import type { MetaClient } from "./meta";
import { jevCostUsd, metaCostUsd } from "./prices";

const OVERRIDE_SCHEMA = {
  type: "object",
  properties: {
    vector: {
      type: "object",
      properties: Object.fromEntries(EMOTIONS.map((id) => [id, { type: "number" }])),
      required: [...EMOTIONS],
      additionalProperties: false,
    },
    reason: { type: "string" },
  },
  required: ["vector", "reason"],
  additionalProperties: false,
};

export interface ClassifyMetaUsage {
  model: string;
  requests: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
}

async function classifyScene(
  scene: Scene,
  text: string,
  bookTitle: string,
  chapterTitle: string,
  deps: { jev: JevClient; meta: MetaClient },
  metaUsage: ClassifyMetaUsage,
): Promise<SceneEmotion> {
  let jev;
  try {
    jev = await deps.jev.classify({ book: bookTitle, chapter: chapterTitle, sceneTitle: scene.title, scene: text });
  } catch (error) {
    return { jev: null, muse_override: null, final: null, error: `jev failed: ${(error as Error).message}` };
  }
  if (!needsOverride({ choice: jev.choice, confidence: jev.confidence, probabilities: jev.vector })) {
    const final = jevFinal({ probabilities: jev.vector, intensity: jev.intensity, tempo: jev.tempo });
    return { jev, muse_override: null, final, error: final === null ? "jev vector renormalizes to zero" : null };
  }
  try {
    const result = await deps.meta.completeJson({
      system: "You score soundtrack mood as a probability mix over 8 feelings. Answer with JSON only.",
      user:
        `Scene "${scene.title}": ${text}\nJev vector: ${JSON.stringify(jev.vector)} ` +
        `(choice ${jev.choice}, confidence ${jev.confidence}). ` +
        `Give a probability mix over the 8 feelings only, plus one short sentence for reason.`,
      schemaName: "emotion_override",
      schema: OVERRIDE_SCHEMA,
    });
    metaUsage.requests += 1;
    metaUsage.promptTokens += result.promptTokens;
    metaUsage.cachedTokens += result.cachedTokens;
    metaUsage.completionTokens += result.completionTokens;
    const parsed = result.data as { vector?: Partial<Record<EmotionId, number>>; reason?: unknown };
    const vector = renormalize8(parsed.vector ?? {});
    if (vector === null) {
      return { jev, muse_override: null, final: null, error: "override vector is all zero" };
    }
    const override = { vector, reason: String(parsed.reason ?? ""), model: deps.meta.model };
    return { jev, muse_override: override, final: { vector, intensity: jev.intensity, tempo: jev.tempo }, error: null };
  } catch (error) {
    return { jev, muse_override: null, final: null, error: `override failed: ${(error as Error).message}` };
  }
}

export async function runClassify(ctx: StepCtx, deps: { jev: JevClient; meta: MetaClient }): Promise<AnalyzedScene[]> {
  const book = JSON.parse(readFileSync(join(ctx.dir, "book.json"), "utf8")) as Book;
  const scenesFile = JSON.parse(readFileSync(join(ctx.dir, "scenes.json"), "utf8")) as {
    scenes: Scene[];
    provenance: { meta: { model: string; requests: number; prompt_tokens: number; cached_tokens: number; completion_tokens: number; cost_usd: number } };
  };
  const outPath = join(ctx.dir, "analysis.json");
  if (!ctx.force) {
    const fresh = readIfFresh<{ textVersion: string; scenes: AnalyzedScene[] }>(outPath, book.textVersion);
    if (fresh) return fresh.scenes;
  }
  const metaUsage: ClassifyMetaUsage = { model: deps.meta.model, requests: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, costUsd: 0 };
  const byN = new Map(book.paragraphs.map((p) => [p.n, p]));
  const chapterTitle = new Map(book.chapters.map((c) => [c.ch, c.title]));
  let jevInputTokens = 0;
  let jevOutputTokens = 0;
  let jevRequests = 0;
  const scenes = await runPool(scenesFile.scenes, 4, async (scene) => {
    const texts: string[] = [];
    for (let n = scene.start_n; n <= scene.end_n; n++) texts.push(byN.get(n)?.text ?? "");
    const emotion = await classifyScene(scene, texts.join("\n"), book.title, chapterTitle.get(scene.ch) ?? "", deps, metaUsage);
    if (emotion.jev) {
      jevInputTokens += emotion.jev.input_tokens;
      jevOutputTokens += emotion.jev.output_tokens;
      jevRequests += 1;
    }
    return { ...scene, ...emotion };
  });
  metaUsage.costUsd = metaCostUsd({ prompt: metaUsage.promptTokens, cached: metaUsage.cachedTokens, completion: metaUsage.completionTokens });
  const jevCost = jevCostUsd(jevInputTokens);
  const segment = scenesFile.provenance.meta;
  const metaTotal = {
    model: deps.meta.model,
    requests: segment.requests + metaUsage.requests,
    prompt_tokens: segment.prompt_tokens + metaUsage.promptTokens,
    cached_tokens: segment.cached_tokens + metaUsage.cachedTokens,
    completion_tokens: segment.completion_tokens + metaUsage.completionTokens,
    cost_usd: segment.cost_usd + metaUsage.costUsd,
  };
  const overrides = scenes.filter((s) => s.muse_override !== null).length;
  writeFileSync(
    outPath,
    `${JSON.stringify({
      bookId: book.id,
      textVersion: book.textVersion,
      scenes,
      override_rate: scenes.length > 0 ? overrides / scenes.length : 0,
      provenance: {
        date: new Date().toISOString(),
        jev: { model: deps.jev.model, requests: jevRequests, input_tokens: jevInputTokens, output_tokens: jevOutputTokens, cost_usd: jevCost },
        meta: metaTotal,
        total_cost_usd: jevCost + metaTotal.cost_usd,
      },
    })}\n`,
  );
  return scenes;
}
