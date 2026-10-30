// Step 2: one Meta call per chapter to split it into scenes. Invalid
// output retries once with the problems in the prompt, then fails the
// run with no silent repair.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateSceneCoverage } from "../core/scenes";
import type { Book, Chapter, Scene, SceneInput } from "../core/types";
import { decide, segmentKeys } from "./freshness";
import type { StepCtx } from "./ingest";
import { runPool } from "./http";
import type { MetaClient } from "./meta";
import { metaCostUsd } from "./prices";

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
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
  required: ["scenes"],
  additionalProperties: false,
};

function chapterPrompt(chapter: Chapter, paragraphs: { n: number; text: string }[], problems?: string): string {
  const lines = paragraphs.map((p) => `[${p.n}] ${p.text}`).join("\n");
  const base =
    `Split chapter "${chapter.title}" into scenes in order. A scene is a stretch with one dominant mood, ` +
    `so the soundtrack can change inside the chapter at mood shifts (location change, danger starts or ends, a reveal). ` +
    `Usually 3 to 25 paragraphs per scene; a very short chapter may be one scene. ` +
    `Each scene needs start_n, end_n (global paragraph ordinals), title, summary, and characters. ` +
    `Cover every paragraph exactly once: first start_n is ${chapter.start_n}, last end_n is ${chapter.end_n}.\n\n${lines}`;
  return problems ? `${base}\n\nYour last answer had these coverage problems, fix them:\n${problems}` : base;
}

function parseScenes(data: unknown): SceneInput[] {
  const scenes = (data as { scenes?: unknown })?.scenes;
  if (!Array.isArray(scenes)) throw new Error("Meta answer has no scenes array");
  return scenes.map((s) => {
    const scene = s as Record<string, unknown>;
    return {
      start_n: Number(scene.start_n),
      end_n: Number(scene.end_n),
      title: String(scene.title ?? ""),
      summary: String(scene.summary ?? ""),
      characters: Array.isArray(scene.characters) ? scene.characters.map(String) : [],
    };
  });
}

export interface SegmentUsage {
  model: string;
  requests: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
}

export async function runSegment(ctx: StepCtx, deps: { meta: MetaClient }): Promise<Scene[]> {
  const book = JSON.parse(readFileSync(join(ctx.dir, "book.json"), "utf8")) as Book;
  const outPath = join(ctx.dir, "scenes.json");
  const keys = segmentKeys(ctx.dir);
  if (decide(ctx.force, keys.recorded, keys.current).reuse) {
    return (JSON.parse(readFileSync(outPath, "utf8")) as { scenes: Scene[] }).scenes;
  }
  const usage: SegmentUsage = {
    model: deps.meta.model,
    requests: 0,
    promptTokens: 0,
    cachedTokens: 0,
    completionTokens: 0,
    costUsd: 0,
  };
  const chapters = await runPool(book.chapters, 4, async (chapter) => {
    const paragraphs = book.paragraphs.filter((p) => p.ch === chapter.ch).map((p) => ({ n: p.n, text: p.text }));
    let problems: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await deps.meta.completeJson({
        system: "You split book chapters into scenes for a music soundtrack. Answer with JSON only.",
        user: chapterPrompt(chapter, paragraphs, problems),
        schemaName: "chapter_scenes",
        schema: SCENE_SCHEMA,
      });
      usage.requests += 1;
      usage.promptTokens += result.promptTokens;
      usage.cachedTokens += result.cachedTokens;
      usage.completionTokens += result.completionTokens;
      const inputs = parseScenes(result.data);
      const found = validateSceneCoverage(chapter, inputs);
      if (found.length === 0) {
        return inputs.map((scene, k) => ({ ...scene, id: `c${chapter.ch}s${k + 1}`, ch: chapter.ch }) as Scene);
      }
      problems = found.map((p) => p.message).join("\n");
    }
    throw new Error(`chapter ${chapter.ch} scenes still invalid after retry: ${problems}`);
  });
  const scenes = chapters.flat();
  usage.costUsd = metaCostUsd({ prompt: usage.promptTokens, cached: usage.cachedTokens, completion: usage.completionTokens }, usage.model);
  writeFileSync(
    outPath,
    `${JSON.stringify({
      bookId: book.id,
      textVersion: book.textVersion,
      scenes,
      provenance: {
        date: new Date().toISOString(),
        meta: {
          model: usage.model,
          requests: usage.requests,
          prompt_tokens: usage.promptTokens,
          cached_tokens: usage.cachedTokens,
          completion_tokens: usage.completionTokens,
          cost_usd: usage.costUsd,
        },
      },
    })}\n`,
  );
  return scenes;
}
