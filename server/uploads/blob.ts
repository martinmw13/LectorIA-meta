import "server-only";
import { del, get, list, put } from "@vercel/blob";

// Private Blob store for uploads: book text belongs to the reader, so
// paths carry the unguessable job id, blobs stay private, and only this
// server module reads them back. Routes never return Blob URLs. The token
// is always explicit: the default env store is the public image store,
// which cannot hold private blobs.
export interface UploadStore {
  saveJson(path: string, json: string): Promise<void>;
  readText(path: string): Promise<string | null>;
  remove(path: string): Promise<void>;
  listAll(prefix: string): Promise<{ pathname: string; uploadedAt: number }[]>;
}

const BLOB_TIMEOUT_MS = 8_000;

export function createUploadStore(token: string): UploadStore {
  return {
    async saveJson(path: string, json: string): Promise<void> {
      await put(path, json, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token,
        abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
      });
    },
    async readText(path: string): Promise<string | null> {
      // Null when the path was never written; anything else throws.
      const found = await get(path, {
        access: "private",
        useCache: false,
        token,
        abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
      });
      if (!found || found.stream === null) return null;
      return await new Response(found.stream).text();
    },
    async remove(path: string): Promise<void> {
      await del(path, { token, abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });
    },
    async listAll(prefix: string): Promise<{ pathname: string; uploadedAt: number }[]> {
      const out: { pathname: string; uploadedAt: number }[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await list({
          prefix,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
          token,
          abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
        });
        for (const blob of page.blobs) out.push({ pathname: blob.pathname, uploadedAt: blob.uploadedAt.getTime() });
        if (!page.hasMore) break;
        cursor = page.cursor;
      }
      return out;
    },
  };
}
