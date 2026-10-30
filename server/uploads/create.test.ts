// A slow judge must not stall the create request: the wall-clock budget
// cuts it off and the book keeps its deterministic chapters.
import { describe, expect, it } from "vitest";
import { createUpload } from "./create";
import { createMemoryKV, helpfulMeta, memoryStore, tinyBook } from "./test-support";

describe("createUpload judge budget", () => {
  it("keeps deterministic chapters when the judge outruns its budget", async () => {
    const meta = helpfulMeta();
    const real = meta.completeJson.bind(meta);
    let judgeCalls = 0;
    meta.completeJson = async (input) => {
      if (input.schemaName === "clean_judge") {
        judgeCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return real(input);
    };
    const kv = createMemoryKV();
    const started = Date.now();
    const out = await createUpload({
      kv,
      store: memoryStore(),
      meta,
      body: { ...tinyBook(), author: null },
      path: "byok",
      anonId: "anon-test",
      day: "2026-10-30",
      quotaKeys: null,
      spendCapMicro: 10_000_000,
      judgeBudgetMs: 25,
    });
    expect(Date.now() - started).toBeLessThan(400);
    expect(judgeCalls).toBe(1);
    expect(out.chapters).toBe(2);
    const job = JSON.parse((await kv.get(`upload:job:${out.id}`)) as string) as { usage: { metaRequests: number } };
    expect(job.usage.metaRequests).toBe(0);
  });
});
