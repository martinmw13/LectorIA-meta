// In-memory UploadStore for tests and the e2e harness. No server-only
// import, so scripts can load it under plain tsx.
import type { UploadStore } from "./blob";

export type MemoryStore = UploadStore & {
  files: Map<string, string>;
  writes: { path: string; json: string }[];
};

export function memoryStore(times: Map<string, number> = new Map()): MemoryStore {
  const files = new Map<string, string>();
  const writes: { path: string; json: string }[] = [];
  return {
    files,
    writes,
    async saveJson(path: string, json: string): Promise<void> {
      files.set(path, json);
      writes.push({ path, json });
    },
    async readText(path: string): Promise<string | null> {
      return files.get(path) ?? null;
    },
    async remove(path: string): Promise<void> {
      files.delete(path);
    },
    async listAll(prefix: string): Promise<{ pathname: string; uploadedAt: number }[]> {
      return [...files.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((pathname) => ({ pathname, uploadedAt: times.get(pathname) ?? Date.now() }));
    },
  };
}
