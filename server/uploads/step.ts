import "server-only";
import { randomUUID } from "node:crypto";
import type { AnalyzedScene, SceneEmotion, SceneInput } from "@/core/types";
import { validateBookCoverage } from "@/core/scenes";
import {
  UPLOAD_JOB_TTL_SEC,
  UPLOAD_TTL_DAYS,
  partKey,
  uploadAnalysisPath,
  uploadBookPath,
  uploadDailySpendKey,
  uploadPartPath,
} from "@/core/uploads";
import { refundDualQuota } from "@/server/guard/quota";
import { spendKey } from "@/server/guard/spend";
import type { KV } from "@/core/types";
import type { JevClient } from "../../pipeline/jev";
import type { MetaClient } from "../../pipeline/meta";
import type { UploadStore } from "./blob";
import type { UploadBook } from "./create";
import {
  loadUploadJob,
  saveUploadJob,
  uploadFinalizeKey,
  uploadLockKey,
  uploadRefundKey,
  UPLOAD_LOCK_TTL_SEC,
  UploadFailure,
  type UploadJob,
} from "./state";
import { classifyPart, segmentPart, usageCostMicro, usageCostUsd, WorkError } from "./work";

export interface StepArgs {
  kv: KV;
  store: UploadStore;
  meta: MetaClient;
  jev: JevClient | null;
  id: string;
  chapter?: number;
}

export type StepResult =
  | { status: "working"; id: string; done: number; total: number }
  | { status: "done"; id: string; done: number; total: number; costUsd: number };

interface StoredPart {
  part: string;
  ch: number;
  scenes: (SceneInput & SceneEmotion & { ch: number })[];
}

function parseStoredPart(raw: string): StoredPart | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const p = json as Record<string, unknown>;
  if (typeof p.part !== "string" || typeof p.ch !== "number" || !Array.isArray(p.scenes)) return null;
  for (const s of p.scenes) {
    if (typeof s !== "object" || s === null) return null;
    const scene = s as Record<string, unknown>;
    if (typeof scene.start_n !== "number" || typeof scene.end_n !== "number") return null;
    if (typeof scene.title !== "string" || typeof scene.summary !== "string") return null;
    if (!Array.isArray(scene.characters)) return null;
  }
  return json as StoredPart;
}

function parseUploadBook(raw: string | null, job: UploadJob): UploadBook | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const book = json as Partial<UploadBook>;
  if (book.id !== job.id || book.textVersion !== job.textVersion) return null;
  if (!Array.isArray(book.chapters) || !Array.isArray(book.paragraphs)) return null;
  return json as UploadBook;
}

function workingResult(job: UploadJob): StepResult {
  return { status: "working", id: job.id, done: job.doneParts.length, total: job.parts.length };
}

function doneResult(job: UploadJob): StepResult {
  return {
    status: "done",
    id: job.id,
    done: job.parts.length,
    total: job.parts.length,
    costUsd: job.costMicro !== null ? job.costMicro / 1_000_000 : usageCostUsd(job.usage),
  };
}

// Marks the job failed and refunds quota plus the spend reserve exactly
// once per job, via a setNxEx guard. Best effort throughout: when Redis
// itself is down the reservation is kept, which is the conservative side.
// A job already done is never refunded.
async function failJob(kv: KV, job: UploadJob): Promise<void> {
  if (job.status === "done") return;
  job.status = "failed";
  try {
    await saveUploadJob(kv, job);
  } catch {
    // The refund guard below still bounds us to one refund.
  }
  let first = false;
  try {
    first = await kv.setNxEx(uploadRefundKey(job.id), "1", UPLOAD_JOB_TTL_SEC);
  } catch {
    return;
  }
  if (!first) return;
  if (job.quotaIp && job.quotaAnon) await refundDualQuota(kv, { ip: job.quotaIp, anon: job.quotaAnon });
  if (job.reservedMicro > 0) {
    try {
      await kv.decrBy(spendKey(), job.reservedMicro);
      await kv.decrBy(uploadDailySpendKey(job.day), job.reservedMicro);
    } catch {
      // Kept on Redis failure: conservative, like an abandoned job.
    }
  }
}

async function markDoneAndMaybeFinalize(args: StepArgs, job: UploadJob, part: string): Promise<StepResult> {
  if (!job.doneParts.includes(part)) job.doneParts.push(part);
  await saveUploadJob(args.kv, job);
  if (job.doneParts.length < job.parts.length) return workingResult(job);
  return finalize(args, job);
}

// Assembles the analysis once, under a guard: concurrent last-part drivers
// converge on the winner's result, and a finalize that died between the
// blob write and the job save repairs from the blob on retry.
async function finalize(args: StepArgs, job: UploadJob): Promise<StepResult> {
  const first = await args.kv.setNxEx(uploadFinalizeKey(job.id), "1", UPLOAD_JOB_TTL_SEC);
  if (!first) {
    const fresh = await loadUploadJob(args.kv, job.id);
    if (!fresh) throw new UploadFailure("not_found");
    if (fresh.status === "done") return doneResult(fresh);
    if (fresh.status === "failed") throw new UploadFailure("unavailable");
    const analysis = await args.store.readText(uploadAnalysisPath(job.id));
    if (analysis) {
      fresh.status = "done";
      fresh.costMicro = usageCostMicro(fresh.usage);
      await saveUploadJob(args.kv, fresh);
      return doneResult(fresh);
    }
    return workingResult(fresh);
  }
  const scenes: AnalyzedScene[] = [];
  for (const chapter of [...job.chapters].sort((a, b) => a.ch - b.ch)) {
    const chParts = job.parts.filter((p) => p.ch === chapter.ch).sort((a, b) => a.part - b.part);
    let k = 0;
    for (const p of chParts) {
      const stored = parseStoredPart(await args.store.readText(uploadPartPath(job.id, partKey(p))) ?? "");
      if (!stored) throw new WorkError("store");
      for (const s of stored.scenes) {
        k += 1;
        scenes.push({ ...s, id: `c${chapter.ch}s${k}`, ch: chapter.ch });
      }
    }
  }
  const book = parseUploadBook(await args.store.readText(uploadBookPath(job.id)), job);
  if (!book) throw new WorkError("store");
  const problems = validateBookCoverage(book, scenes);
  if (problems.length > 0) throw new WorkError("segment");
  await args.store.saveJson(uploadAnalysisPath(job.id), JSON.stringify({ bookId: job.id, textVersion: job.textVersion, scenes }));
  if (job.path === "free" && job.reservedMicro > 0) {
    const delta = usageCostMicro(job.usage) - job.reservedMicro;
    if (delta !== 0) {
      try {
        await args.kv.incrBy(spendKey(), delta);
        await args.kv.incrBy(uploadDailySpendKey(job.day), delta);
      } catch {
        // Best effort: the reserve already bounds the spend.
      }
    }
  }
  job.status = "done";
  job.costMicro = usageCostMicro(job.usage);
  await saveUploadJob(args.kv, job);
  return doneResult(job);
}

// One idempotent unit of work: re-calling a finished part or a finished
// job costs nothing. Any throw after the guards fails the job with the
// once-guarded refund above, and the client sees only `unavailable`.
export async function stepUpload(args: StepArgs): Promise<StepResult> {
  const job = await loadUploadJob(args.kv, args.id);
  if (!job) throw new UploadFailure("not_found");
  if (Date.now() - job.createdAt > UPLOAD_TTL_DAYS * 24 * 3600 * 1000) throw new UploadFailure("expired");
  if (job.status === "failed") throw new UploadFailure("unavailable");
  if (job.status === "done") return doneResult(job);

  const pending = job.parts.filter((p) => !job.doneParts.includes(partKey(p)));
  if (args.chapter !== undefined && !job.chapters.some((c) => c.ch === args.chapter)) {
    throw new UploadFailure("bad_request");
  }
  const wanted = args.chapter === undefined ? pending : pending.filter((p) => p.ch === args.chapter);
  if (wanted.length === 0) {
    if (pending.length > 0) return workingResult(job);
    try {
      return await finalize(args, job);
    } catch (e) {
      if (e instanceof UploadFailure) throw e;
      await failJob(args.kv, job);
      throw new UploadFailure("unavailable");
    }
  }
  const part = wanted[0] as (typeof wanted)[number];
  const key = partKey(part);
  const path = uploadPartPath(job.id, key);
  if (parseStoredPart((await args.store.readText(path)) ?? "")) {
    return markDoneAndMaybeFinalize(args, job, key);
  }

  const lock = uploadLockKey(job.id, key);
  const token = randomUUID();
  if (!(await args.kv.setNxEx(lock, token, UPLOAD_LOCK_TTL_SEC))) return workingResult(job);
  try {
    if (parseStoredPart((await args.store.readText(path)) ?? "")) {
      return markDoneAndMaybeFinalize(args, job, key);
    }
    const book = parseUploadBook(await args.store.readText(uploadBookPath(job.id)), job);
    if (!book) throw new WorkError("store");
    const chapter = job.chapters.find((c) => c.ch === part.ch);
    if (!chapter) throw new WorkError("store");
    const paras = book.paragraphs
      .filter((p) => p.n >= part.startN && p.n <= part.endN)
      .map((p) => ({ n: p.n, text: p.text }));
    const inputs = await segmentPart(
      args.meta,
      { ch: chapter.ch, title: chapter.title, start_n: part.startN, end_n: part.endN },
      paras,
      job.usage,
    );
    const scenes = inputs.map((s, k) => ({ ...s, id: `w-${key}-${k}`, ch: part.ch }));
    const texts = scenes.map((s) =>
      paras
        .filter((p) => p.n >= s.start_n && p.n <= s.end_n)
        .map((p) => p.text)
        .join("\n"),
    );
    const emotions = await classifyPart(
      scenes,
      texts,
      { bookTitle: job.title, chapterTitle: chapter.title },
      { meta: args.meta, jev: args.jev },
      job.usage,
    );
    const stored: StoredPart = {
      part: key,
      ch: part.ch,
      scenes: scenes.map((s, i) => ({
        start_n: s.start_n,
        end_n: s.end_n,
        title: s.title,
        summary: s.summary,
        characters: s.characters,
        ch: s.ch,
        ...(emotions[i] as SceneEmotion),
      })),
    };
    await args.store.saveJson(path, JSON.stringify(stored));
    return await markDoneAndMaybeFinalize(args, job, key);
  } catch (e) {
    if (e instanceof UploadFailure) throw e;
    await failJob(args.kv, job);
    throw new UploadFailure("unavailable");
  } finally {
    try {
      await args.kv.releaseIfToken(lock, token);
    } catch {
      // The TTL frees a lock the route kill left behind.
    }
  }
}
