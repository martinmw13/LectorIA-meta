import "server-only";
import { timingSafeEqual } from "node:crypto";
import { UPLOAD_TTL_DAYS } from "@/core/uploads";
import { usable } from "@/server/guard/env";
import { createUploadStore, type UploadStore } from "./blob";

// Deletes upload blobs older than the TTL. Job state in Redis expires on
// its own; only Blob needs sweeping. One failure never stops the rest.
export async function cleanupUploads(store: UploadStore, nowMs: number = Date.now()): Promise<{ deleted: number }> {
  const cutoff = nowMs - UPLOAD_TTL_DAYS * 24 * 3600 * 1000;
  const blobs = await store.listAll("uploads/");
  let deleted = 0;
  for (const blob of blobs) {
    if (blob.uploadedAt >= cutoff) continue;
    try {
      await store.remove(blob.pathname);
      deleted += 1;
    } catch {
      // The next daily run retries.
    }
  }
  return { deleted };
}

function matchesBearer(auth: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

// Vercel cron calls this daily with CRON_SECRET as the bearer token. Any
// auth failure answers 404 so the route stays hidden.
export async function handleCleanup(
  req: Request,
  deps: { store?: UploadStore; secret?: string; token?: string } = {},
): Promise<Response> {
  const secret = deps.secret ?? usable(process.env.CRON_SECRET);
  if (!secret || !matchesBearer(req.headers.get("authorization") ?? "", secret)) {
    return Response.json({ status: "error", code: "not_found" }, { status: 404 });
  }
  // Same private store as the routes; never the public image store.
  const token = deps.token ?? usable(process.env.UPLOADS_BLOB_READ_WRITE_TOKEN);
  if (!deps.store && !token) {
    console.warn("upload cleanup unavailable");
    return Response.json({ status: "error", code: "unavailable" }, { status: 503 });
  }
  try {
    const out = await cleanupUploads(deps.store ?? createUploadStore(token as string));
    return Response.json({ status: "ok", deleted: out.deleted });
  } catch {
    console.error("upload cleanup failed");
    return Response.json({ status: "error", code: "unavailable" }, { status: 503 });
  }
}
