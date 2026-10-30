import { describe, expect, it } from "vitest";
import { buildReaderModel } from "@/core/reader";
import { handleUploadStep, handleUploadsCreate } from "./handler";
import { loadUploadedBook } from "./loader";
import { parseUploadJob, saveUploadJob } from "./state";
import {
  cookiesFrom,
  createMemoryKV,
  helpfulMeta,
  memoryStore,
  postRequest,
  testEnv,
  tinyBook,
} from "./test-support";

const DAY = "2026-10-30";
const BASE = "https://lectoria.test/api/uploads";

async function finished() {
  const kv = createMemoryKV();
  const store = memoryStore();
  const meta = helpfulMeta();
  const deps = { env: testEnv(), kv, store, meta, now: new Date(`${DAY}T00:00:00Z`) };
  const created = await handleUploadsCreate(postRequest(BASE, tinyBook(), { "x-real-ip": "1.2.3.4" }), deps);
  const { id } = (await created.json()) as { id: string };
  const cookies = cookiesFrom(created);
  const headers = { cookie: cookies, "x-real-ip": "1.2.3.4" };
  await handleUploadStep(postRequest(`${BASE}/${id}/step`, {}, headers), id, deps);
  await handleUploadStep(postRequest(`${BASE}/${id}/step`, {}, headers), id, deps);
  return { id, kv, store };
}

describe("loadUploadedBook", () => {
  it("returns the reader payload for a finished book", async () => {
    const { id, kv, store } = await finished();
    const payload = await loadUploadedBook(id, { kv, store });
    expect(payload).not.toBeNull();
    expect(payload?.book.id).toBe(id);
    expect(payload?.book.title).toBe("Tiny");
    expect(payload?.book.textVersion).toMatch(/^sha256:/);
    expect(payload?.book.chapters.length).toBe(2);
    expect(payload?.book.paragraphs.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(payload?.book.paragraphs[0]?.id).toBe("c1p1");
    expect(payload?.scenes.map((s) => s.id)).toEqual(["c1s1", "c2s1"]);
    // The exact shape the reader consumes: the model builds without throws.
    expect(() => buildReaderModel(payload!.book, { scenes: payload!.scenes })).not.toThrow();
    const model = buildReaderModel(payload!.book, { scenes: payload!.scenes });
    expect(model.chapters.length).toBe(2);
  });

  it("returns null for bad, missing, unfinished, or expired books", async () => {
    const { id, kv, store } = await finished();
    expect(await loadUploadedBook("nope", { kv, store })).toBeNull();
    expect(await loadUploadedBook(`u-${"b".repeat(22)}`, { kv, store })).toBeNull();

    const kv2 = createMemoryKV();
    const store2 = memoryStore();
    const created = await handleUploadsCreate(postRequest(BASE, tinyBook()), {
      env: testEnv(),
      kv: kv2,
      store: store2,
      meta: helpfulMeta(),
    });
    const { id: working } = (await created.json()) as { id: string };
    expect(await loadUploadedBook(working, { kv: kv2, store: store2 })).toBeNull();

    const job = parseUploadJob(await kv.get(`upload:job:${id}`));
    await saveUploadJob(kv, { ...job!, createdAt: Date.now() - 31 * 24 * 3600 * 1000 });
    expect(await loadUploadedBook(id, { kv, store })).toBeNull();
  });

  it("returns null when the stored data is corrupt", async () => {
    const { id, kv, store } = await finished();
    store.files.set(`uploads/${id}/analysis.json`, "{broken");
    expect(await loadUploadedBook(id, { kv, store })).toBeNull();
  });
});
