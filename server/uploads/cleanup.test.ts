import { describe, expect, it } from "vitest";
import { cleanupUploads, handleCleanup } from "./cleanup";
import { memoryStore } from "./test-support";

const DAY_MS = 24 * 3600 * 1000;

describe("cleanupUploads", () => {
  it("deletes only blobs past the TTL", async () => {
    const now = Date.now();
    const times = new Map([
      ["uploads/u-old/book.json", now - 31 * DAY_MS],
      ["uploads/u-new/book.json", now - 2 * DAY_MS],
    ]);
    const store = memoryStore(times);
    await store.saveJson("uploads/u-old/book.json", "{}");
    await store.saveJson("uploads/u-new/book.json", "{}");
    await store.saveJson("images/oz/kept.webp", "x");
    const out = await cleanupUploads(store, now);
    expect(out.deleted).toBe(1);
    expect(store.files.has("uploads/u-old/book.json")).toBe(false);
    expect(store.files.has("uploads/u-new/book.json")).toBe(true);
    expect(store.files.has("images/oz/kept.webp")).toBe(true);
  });

  it("keeps going when one delete fails", async () => {
    const now = Date.now();
    const store = memoryStore(
      new Map([
        ["uploads/a/book.json", now - 40 * DAY_MS],
        ["uploads/b/book.json", now - 40 * DAY_MS],
      ]),
    );
    await store.saveJson("uploads/a/book.json", "{}");
    await store.saveJson("uploads/b/book.json", "{}");
    let calls = 0;
    const real = store.remove.bind(store);
    store.remove = async (path: string) => {
      calls += 1;
      if (calls === 1) throw new Error("blob down");
      await real(path);
    };
    const out = await cleanupUploads(store, now);
    expect(out.deleted).toBe(1);
  });
});

describe("handleCleanup", () => {
  const req = (auth?: string): Request =>
    new Request("https://lectoria.test/api/cron/cleanup-uploads", {
      headers: auth ? { authorization: auth } : {},
    });

  it("hides the route without the secret", async () => {
    expect((await handleCleanup(req(), { store: memoryStore(), secret: "s3cr3t" })).status).toBe(404);
    expect((await handleCleanup(req("Bearer wrong"), { store: memoryStore(), secret: "s3cr3t" })).status).toBe(404);
    expect((await handleCleanup(req("Bearer s3cr3t"), { store: memoryStore() })).status).toBe(404);
  });

  it("sweeps with the secret", async () => {
    const store = memoryStore(new Map([["uploads/u-old/book.json", Date.now() - 40 * DAY_MS]]));
    await store.saveJson("uploads/u-old/book.json", "{}");
    const res = await handleCleanup(req("Bearer s3cr3t"), { store, secret: "s3cr3t" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", deleted: 1 });
  });
});
