import "server-only";
import { list, put } from "@vercel/blob";
import type { ImageStore } from "@/core/images";

// Blob wrappers. Paths are deterministic and public; routes return URLs,
// never bytes. @vercel/blob reads BLOB_READ_WRITE_TOKEN from env.
const BLOB_TIMEOUT_MS = 8_000;

// Each call fails fast inside the 120 s route budget (Meta takes up to
// 100 s), so a slow Blob still leaves time for the refund and unlock.
export function createBlobStore(): ImageStore {
  return {
    // list stands in for head: a deterministic path has no known URL
    // until the store prefix is resolved, so match the exact pathname.
    async findUrl(path: string): Promise<string | null> {
      const page = await list({ prefix: path, limit: 10, abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
      return page.blobs.find((b) => b.pathname === path)?.url ?? null;
    },
    async save(path: string, bytes: Uint8Array): Promise<string> {
      const blob = await put(path, Buffer.from(bytes), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "image/webp",
        cacheControlMaxAge: 31536000,
        abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
      });
      return blob.url;
    },
  };
}
