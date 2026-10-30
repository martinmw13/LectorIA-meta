import "server-only";
import type { AnalyzedScene, Chapter, KV, Paragraph } from "@/core/types";
import { UPLOAD_TTL_DAYS, isUploadId, uploadAnalysisPath, uploadBookPath } from "@/core/uploads";
import { createRestKV } from "@/server/guard/kv";
import { createUploadStore, type UploadStore } from "./blob";
import { readUploadEnv } from "./env";
import { loadUploadJob } from "./state";

// The same shape the reader consumes for shelf books. The owner wires
// this into the generic book loader once that route lands.
export interface BookPayload {
  book: {
    id: string;
    title: string;
    author: string;
    chapters: Chapter[];
    paragraphs: Paragraph[];
    textVersion: string;
  };
  scenes: AnalyzedScene[];
}

// Null when the id is bad, the job never finished, the book expired, or
// the stored data fails its shape check. Never throws.
export async function loadUploadedBook(
  id: string,
  deps: { kv?: KV; store?: UploadStore } = {},
): Promise<BookPayload | null> {
  if (!isUploadId(id)) return null;
  let kv = deps.kv;
  let store = deps.store;
  if (!kv || !store) {
    let env;
    try {
      env = readUploadEnv();
    } catch {
      return null;
    }
    kv ??= createRestKV(env.upstashUrl, env.upstashToken);
    store ??= createUploadStore(env.uploadsToken);
  }
  let job;
  try {
    job = await loadUploadJob(kv, id);
  } catch {
    return null;
  }
  if (!job || job.status !== "done") return null;
  if (Date.now() - job.createdAt > UPLOAD_TTL_DAYS * 24 * 3600 * 1000) return null;
  let bookRaw: string | null;
  let analysisRaw: string | null;
  try {
    [bookRaw, analysisRaw] = await Promise.all([
      store.readText(uploadBookPath(id)),
      store.readText(uploadAnalysisPath(id)),
    ]);
  } catch {
    return null;
  }
  if (bookRaw === null || analysisRaw === null) return null;
  let book: unknown;
  let analysis: unknown;
  try {
    book = JSON.parse(bookRaw);
    analysis = JSON.parse(analysisRaw);
  } catch {
    return null;
  }
  if (typeof book !== "object" || book === null || typeof analysis !== "object" || analysis === null) {
    return null;
  }
  const b = book as Partial<BookPayload["book"]>;
  const a = analysis as { bookId?: unknown; textVersion?: unknown; scenes?: unknown };
  if (b.id !== id || b.textVersion !== job.textVersion || a.bookId !== id || a.textVersion !== job.textVersion) {
    return null;
  }
  if (!Array.isArray(b.chapters) || !Array.isArray(b.paragraphs) || !Array.isArray(a.scenes)) return null;
  if (typeof b.title !== "string" || typeof b.author !== "string") return null;
  if (!a.scenes.every((s) => typeof s === "object" && s !== null && typeof (s as { id?: unknown }).id === "string")) {
    return null;
  }
  return { book: book as BookPayload["book"], scenes: a.scenes as AnalyzedScene[] };
}
