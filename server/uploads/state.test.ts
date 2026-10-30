import { describe, expect, it } from "vitest";
import type { KV } from "@/core/types";
import { uploadDailySpendKey } from "@/core/uploads";
import { spendKey } from "@/server/guard/spend";
import { createUpload } from "./create";
import { failUploadJob, loadUploadJob, uploadJobKey, uploadRefundKey, usageCostMicro } from "./state";
import { stepUpload } from "./step";
import { createMemoryKV, helpfulMeta, memoryStore, tinyBook } from "./test-support";

const DAY = "2026-10-30";

async function workingFlow() {
  const kv = createMemoryKV();
  const store = memoryStore();
  const out = await createUpload({
    kv,
    store,
    meta: helpfulMeta(),
    body: { ...tinyBook(), author: null },
    path: "free",
    anonId: "anon-1",
    day: DAY,
    quotaKeys: { ip: "q-ip", anon: "q-anon" },
    spendCapMicro: 10_000_000,
  });
  await stepUpload({ kv, store, meta: helpfulMeta(), jev: null, id: out.id, chapter: 1 });
  return { kv, store, id: out.id };
}

describe("failUploadJob", () => {
  it("settles spend before saving the failed status", async () => {
    const flow = await workingFlow();
    const job = await loadUploadJob(flow.kv, flow.id);
    const events: string[] = [];
    const inner: KV = flow.kv;
    const kv: KV = {
      ...inner,
      async set(key: string, value: string): Promise<void> {
        events.push(`set:${key}`);
        return inner.set(key, value);
      },
      async setNxEx(key: string, value: string, exSec: number): Promise<boolean> {
        events.push(`setNx:${key}`);
        return inner.setNxEx(key, value, exSec);
      },
    };
    await failUploadJob(kv, flow.store, job!);
    const settleAt = events.indexOf(`setNx:${uploadRefundKey(flow.id)}`);
    const saveAt = events.indexOf(`set:${uploadJobKey(flow.id)}`);
    expect(settleAt).toBeGreaterThanOrEqual(0);
    expect(saveAt).toBeGreaterThanOrEqual(0);
    expect(settleAt).toBeLessThan(saveAt);
  });

  it("keeps the settle when the failed save throws", async () => {
    const flow = await workingFlow();
    const job = await loadUploadJob(flow.kv, flow.id);
    const inner: KV = flow.kv;
    const kv: KV = {
      ...inner,
      async set(key: string, value: string): Promise<void> {
        if (key === uploadJobKey(flow.id)) throw new Error("redis down");
        return inner.set(key, value);
      },
    };
    await failUploadJob(kv, flow.store, job!);
    expect(await inner.get(uploadRefundKey(flow.id))).toBe("1");
    const kept = usageCostMicro(job!.usage);
    expect(kept).toBeGreaterThan(0);
    expect(await inner.get(spendKey())).toBe(String(kept));
    expect(await inner.get(uploadDailySpendKey(DAY))).toBe(String(kept));
  });
});
