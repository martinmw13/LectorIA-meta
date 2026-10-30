import "server-only";
import type { KV } from "@/core/types";
import { UPLOAD_JOB_TTL_SEC, isUploadId, type UploadErrorCode, type UploadPart } from "@/core/uploads";

// Control flow between orchestration and HTTP: the handler maps the code
// to a status and message, never the wrapped error.
export class UploadFailure extends Error {
  constructor(public code: UploadErrorCode) {
    super(code);
    this.name = "UploadFailure";
  }
}

// Job state lives in Redis; book text lives in private Blob. The state
// holds ordinals and money only, never text and never keys.
export interface UploadUsage {
  metaPrompt: number;
  metaCached: number;
  metaCompletion: number;
  metaRequests: number;
  jevInput: number;
  jevOutput: number;
  jevRequests: number;
}

export function emptyUsage(): UploadUsage {
  return { metaPrompt: 0, metaCached: 0, metaCompletion: 0, metaRequests: 0, jevInput: 0, jevOutput: 0, jevRequests: 0 };
}

export type UploadStatus = "working" | "done" | "failed";

export interface UploadJobChapter {
  ch: number;
  title: string;
  start_n: number;
  end_n: number;
}

export interface UploadJob {
  v: 1;
  id: string;
  path: "free" | "byok";
  anonId: string | null;
  day: string;
  createdAt: number;
  title: string;
  author: string;
  textVersion: string;
  chapters: UploadJobChapter[];
  parts: UploadPart[];
  doneParts: string[];
  status: UploadStatus;
  usage: UploadUsage;
  reservedMicro: number;
  quotaIp: string | null;
  quotaAnon: string | null;
  costMicro: number | null;
}

export function uploadJobKey(id: string): string {
  return `upload:job:${id}`;
}

export function uploadLockKey(id: string, part: string): string {
  return `upload:lock:${id}:${part}`;
}

// Guards the exactly-once refund and finalize across concurrent drivers.
export function uploadRefundKey(id: string): string {
  return `upload:refunded:${id}`;
}

export function uploadFinalizeKey(id: string): string {
  return `upload:finalized:${id}`;
}

export const UPLOAD_LOCK_TTL_SEC = 120;

function isPart(value: unknown): value is UploadPart {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(p.ch) &&
    (p.ch as number) >= 1 &&
    Number.isSafeInteger(p.part) &&
    (p.part as number) >= 1 &&
    Number.isSafeInteger(p.startN) &&
    Number.isSafeInteger(p.endN) &&
    (p.startN as number) <= (p.endN as number)
  );
}

function isUsage(value: unknown): value is UploadUsage {
  if (typeof value !== "object" || value === null) return false;
  return (["metaPrompt", "metaCached", "metaCompletion", "metaRequests", "jevInput", "jevOutput", "jevRequests"] as const).every(
    (k) => typeof (value as Record<string, unknown>)[k] === "number",
  );
}

// Defensive read: Redis is trusted but a corrupt value must not crash the
// route. Returns the job, or null when missing or unparseable.
export function parseUploadJob(raw: string | null): UploadJob | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const j = json as Record<string, unknown>;
  if (j.v !== 1 || !isUploadId(j.id)) return null;
  if (j.path !== "free" && j.path !== "byok") return null;
  if (j.anonId !== null && typeof j.anonId !== "string") return null;
  if (typeof j.day !== "string" || typeof j.createdAt !== "number") return null;
  if (typeof j.title !== "string" || typeof j.author !== "string") return null;
  if (typeof j.textVersion !== "string") return null;
  if (!Array.isArray(j.chapters) || !Array.isArray(j.parts) || !Array.isArray(j.doneParts)) return null;
  if (!j.parts.every(isPart) || !j.doneParts.every((d) => typeof d === "string")) return null;
  if (j.status !== "working" && j.status !== "done" && j.status !== "failed") return null;
  if (!isUsage(j.usage)) return null;
  if (typeof j.reservedMicro !== "number") return null;
  if (j.quotaIp !== null && typeof j.quotaIp !== "string") return null;
  if (j.quotaAnon !== null && typeof j.quotaAnon !== "string") return null;
  if (j.costMicro !== null && typeof j.costMicro !== "number") return null;
  for (const c of j.chapters) {
    if (typeof c !== "object" || c === null) return null;
    const ch = c as Record<string, unknown>;
    if (!Number.isSafeInteger(ch.ch) || typeof ch.title !== "string") return null;
    if (!Number.isSafeInteger(ch.start_n) || !Number.isSafeInteger(ch.end_n)) return null;
  }
  return json as UploadJob;
}

export async function loadUploadJob(kv: KV, id: string): Promise<UploadJob | null> {
  return parseUploadJob(await kv.get(uploadJobKey(id)));
}

export async function saveUploadJob(kv: KV, job: UploadJob): Promise<void> {
  await kv.set(uploadJobKey(job.id), JSON.stringify(job));
  await kv.expire(uploadJobKey(job.id), UPLOAD_JOB_TTL_SEC);
}
