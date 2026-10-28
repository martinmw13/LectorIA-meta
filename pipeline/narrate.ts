// Step 5: one Kokoro mp3 plus sentence timings per chapter, cached by
// content hash so a second reader of the same text gets it free. Last
// step: every cache key includes the frozen textVersion, so switching
// between the Blob and local stores later is a re-run with identical keys.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureChapterNarration } from "../core/narration-cache";
import type { NarrationDeps } from "../core/narration-cache";
import {
  NARRATION_FORMAT,
  NARRATION_MODEL,
  NARRATION_SPEED,
  NARRATION_VOICE,
  actualNarrationMicro,
  chapterChunks,
  parseChapterNarration,
} from "../core/narration";
import type { ChapterNarration } from "../core/narration";
import type { Book } from "../core/types";
import { decide, narrateKeys } from "./freshness";
import type { StepCtx } from "./ingest";

export const NARRATION_CONCURRENCY = 4;
const DEFAULT_CAP_USD = 2;

export interface NarrateStats {
  generated: number;
  cached: number;
  gpuSec: number;
  estimatedMicro: number;
  actualMicro: number;
  stopped: boolean;
}

function parseCapUsd(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CAP_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CAP_USD;
}

// Local store for dev and for Oz before Blob is wired: audio at
// public/<key>.mp3 with src /<key>.mp3, manifest json next to it.
export function createLocalNarrationStore(publicDir: string): NarrationDeps["store"] {
  const pathOf = (key: string, ext: string): string => join(publicDir, `${key}${ext}`);
  return {
    getManifest: async (key: string) => {
      try {
        return parseChapterNarration(JSON.parse(readFileSync(pathOf(key, ".json"), "utf8")) as unknown);
      } catch {
        return null;
      }
    },
    putAudio: async (key: string, mp3: Uint8Array) => {
      const path = pathOf(key, ".mp3");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(mp3));
      return `/${key}.mp3`;
    },
    putManifest: async (key: string, value: ChapterNarration) => {
      const path = pathOf(key, ".json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(value)}\n`);
    },
  };
}

// Blob store with the same keys, so switching stores is a re-run.
export function createBlobNarrationStore(): NarrationDeps["store"] {
  return {
    getManifest: async (key: string) => {
      const { list } = await import("@vercel/blob");
      const path = `${key}.json`;
      const page = await list({ prefix: path, limit: 10 });
      const url = page.blobs.find((b) => b.pathname === path)?.url ?? null;
      if (!url) return null;
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return parseChapterNarration((await response.json()) as unknown);
      } catch {
        return null;
      }
    },
    putAudio: async (key: string, mp3: Uint8Array) => {
      const { put } = await import("@vercel/blob");
      const blob = await put(`${key}.mp3`, Buffer.from(mp3), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "audio/mpeg",
        cacheControlMaxAge: 31536000,
      });
      return blob.url;
    },
    putManifest: async (key: string, value: ChapterNarration) => {
      const { put } = await import("@vercel/blob");
      await put(`${key}.json`, JSON.stringify(value), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
        cacheControlMaxAge: 31536000,
      });
    },
  };
}

export async function runNarrate(
  ctx: StepCtx,
  deps: {
    synthesize: NarrationDeps["synthesize"];
    store?: NarrationDeps["store"];
    capUsd?: number;
  },
): Promise<NarrateStats> {
  const book = JSON.parse(readFileSync(join(ctx.dir, "book.json"), "utf8")) as Book;
  const keys = narrateKeys(ctx.dir);
  if (decide(ctx.force, keys.recorded, keys.current).reuse) {
    console.log("narrate: reuse (inputs unchanged)");
    return { generated: 0, cached: book.chapters.length, gpuSec: 0, estimatedMicro: 0, actualMicro: 0, stopped: false };
  }
  const outPath = join(ctx.dir, "narration.json");
  const previous = (() => {
    try {
      return JSON.parse(readFileSync(outPath, "utf8")) as {
        chapters?: Record<string, ChapterNarration>;
      };
    } catch {
      return null;
    }
  })();
  const byKey = new Map<string, ChapterNarration>();
  for (const manifest of Object.values(previous?.chapters ?? {})) byKey.set(manifest.key, manifest);
  const store = deps.store ?? (process.env.BLOB_READ_WRITE_TOKEN ? createBlobNarrationStore() : createLocalNarrationStore("public"));
  const capMicro = Math.round((deps.capUsd ?? parseCapUsd(process.env.NARRATION_CAP_USD)) * 1_000_000);
  let spent = 0;
  const budget = {
    reserve: async (micro: number) => {
      if (spent + micro > capMicro) return false;
      spent += micro;
      return true;
    },
    refund: async (micro: number) => {
      spent -= micro;
    },
  };
  const stats: NarrateStats = { generated: 0, cached: 0, gpuSec: 0, estimatedMicro: 0, actualMicro: 0, stopped: false };
  const chapters: Record<string, ChapterNarration> = {};
  const failed: number[] = [];
  // Bounded pool that stops starting new chapters once the cap refuses,
  // so the run reports instead of spending more.
  let next = 0;
  const sha256Hex = async (text: string): Promise<string> => createHash("sha256").update(text).digest("hex");
  const one = async (ch: number): Promise<void> => {
    const paras = book.paragraphs
      .filter((p) => p.ch === ch)
      .sort((a, b) => a.n - b.n)
      .map((p) => ({ n: p.n, text: p.text }));
    const { chunks, gaps } = chapterChunks(paras);
    let gpuSec = 0;
    const result = await ensureChapterNarration(
      { chunks, gaps },
      {
        sha256Hex,
        index: {
          get: async (key: string) => byKey.get(key) ?? null,
          set: async (key: string, value: ChapterNarration) => {
            byKey.set(key, value);
          },
        },
        store,
        budget,
        synthesize: async (req) => {
          const out = await deps.synthesize(req);
          gpuSec = out.gpuSec;
          return out;
        },
      },
    );
    if (result.status === "error" && result.code === "budget") {
      stats.stopped = true;
      return;
    }
    // A failed chapter must not lose the paid chapters: record it, keep
    // going, and fail only after the ready chapters are written.
    if (result.status !== "ready") {
      failed.push(ch);
      return;
    }
    chapters[String(ch)] = result.narration;
    if (result.cached) {
      stats.cached += 1;
      console.log(`ch ${ch}: cached`);
    } else {
      stats.generated += 1;
      stats.gpuSec += gpuSec;
      stats.estimatedMicro += result.costMicro;
      stats.actualMicro += actualNarrationMicro(gpuSec);
      console.log(`ch ${ch}: generated ${result.narration.durationSec.toFixed(1)} s audio, ${gpuSec.toFixed(1)} s gpu`);
    }
  };
  const workers = new Array(Math.min(NARRATION_CONCURRENCY, book.chapters.length)).fill(null).map(async () => {
    while (next < book.chapters.length && !stats.stopped) {
      const chapter = book.chapters[next] as Book["chapters"][number];
      next += 1;
      await one(chapter.ch);
    }
  });
  await Promise.all(workers);
  const complete = !stats.stopped && failed.length === 0 && Object.keys(chapters).length === book.chapters.length;
  writeFileSync(
    outPath,
    `${JSON.stringify({
      textVersion: book.textVersion,
      provenance: {
        // An incomplete run records no input, so the next run redoes
        // instead of reusing a partial chapters map.
        input: complete ? keys.current : null,
        voice: NARRATION_VOICE,
        model: NARRATION_MODEL,
        speed: NARRATION_SPEED,
        format: NARRATION_FORMAT,
        chapters_generated: stats.generated,
        chapters_cached: stats.cached,
        gpu_seconds: Math.round(stats.gpuSec * 10) / 10,
        cost_usd_estimated: Math.round((stats.estimatedMicro / 1_000_000) * 1e6) / 1e6,
        cost_usd_actual: Math.round((stats.actualMicro / 1_000_000) * 1e6) / 1e6,
      },
      chapters,
    })}\n`,
  );
  console.log(
    `narrate: ${stats.generated} generated, ${stats.cached} cached, ` +
      `estimated $${(stats.estimatedMicro / 1_000_000).toFixed(4)}, actual $${(stats.actualMicro / 1_000_000).toFixed(4)}` +
      (stats.stopped ? ` (stopped at cap $${(capMicro / 1_000_000).toFixed(2)})` : ""),
  );
  if (failed.length > 0) throw new Error(`narration failed for chapter ${[...failed].sort((a, b) => a - b).join(", ")}`);
  return stats;
}
