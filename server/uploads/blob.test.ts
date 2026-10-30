// The uploads token reaches every Blob call explicitly: the default env
// store is the public image store, which cannot hold private blobs.
import { describe, expect, it, vi } from "vitest";

const seen: { fn: string; opts: unknown }[] = [];

vi.mock("@vercel/blob", () => ({
  put: async (...args: unknown[]) => {
    seen.push({ fn: "put", opts: args[args.length - 1] });
  },
  get: async (...args: unknown[]) => {
    seen.push({ fn: "get", opts: args[args.length - 1] });
    return null;
  },
  del: async (...args: unknown[]) => {
    seen.push({ fn: "del", opts: args[args.length - 1] });
  },
  list: async (...args: unknown[]) => {
    seen.push({ fn: "list", opts: args[args.length - 1] });
    return { blobs: [], hasMore: false };
  },
}));

import { createUploadStore } from "./blob";

describe("createUploadStore", () => {
  it("passes the private token to every blob call", async () => {
    seen.length = 0;
    const store = createUploadStore("uploads-tok");
    await store.saveJson("uploads/u/book.json", "{}");
    expect(await store.readText("uploads/u/book.json")).toBeNull();
    await store.remove("uploads/u/book.json");
    expect(await store.listAll("uploads/")).toEqual([]);
    expect(seen.map((s) => s.fn)).toEqual(["put", "get", "del", "list"]);
    for (const s of seen) expect(s.opts).toMatchObject({ token: "uploads-tok" });
    expect(seen[0]?.opts).toMatchObject({ access: "private" });
  });
});
