import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  MSG_CREDITS_OUT,
  MSG_HUMAN,
  imageKey,
  indexKeyFor,
  lockKeyFor,
  quotaKeys,
} from "@/core/images";
import { MAX_RANGES_PER_SCENE, parseRanges, rangeListKeyFor } from "@/core/image-ranges";
import { dailySpendKey, spendKey } from "@/server/guard/spend";
import { hashIp } from "@/server/guard/request";
import { issueHumanCookie } from "@/server/guard/human";
import { orchestrate } from "./orchestrate";
import type { OrchestrateDeps } from "./orchestrate";
import { deps, env, passage } from "./orchestrate-fixtures";

describe("orchestrate", () => {
  it("returns a cached hit without touching Meta, quota, or budget", async () => {
    const d = deps();
    let calls = 0;
    d.generate = { generate: async () => (calls++, new Uint8Array([9])) };
    const first = await orchestrate(passage, d);
    expect(first.status).toBe("ready");
    expect(calls).toBe(1);

    const d2 = deps({ kv: d.kv, store: d.store, generate: d.generate });
    const second = await orchestrate(passage, d2);
    expect(second).toMatchObject({ status: "ready", cached: true });
    expect(calls).toBe(1);
    expect(await d.kv.get(spendKey())).toBe("10000");
  });

  it("backfills the index from Blob when Redis missed", async () => {
    const d = deps();
    await d.store.save("images/oz/t/v1/p3.webp", new Uint8Array([1]));
    let calls = 0;
    d.generate = { generate: async () => (calls++, new Uint8Array([9])) };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "ready", cached: true });
    expect(calls).toBe(0);
  });

  it("gives pending to a second requester holding no lock", async () => {
    const d = deps();
    let releaseGen!: (bytes: Uint8Array) => void;
    let genCalled!: () => void;
    const called = new Promise<void>((resolve) => (genCalled = resolve));
    d.generate = {
      generate: () =>
        new Promise<Uint8Array>((resolve) => {
          releaseGen = resolve;
          genCalled();
        }),
    };
    const held = orchestrate(passage, { ...d, token: "owner" });
    await called;
    const res = await orchestrate(passage, { ...d, token: "other" });
    expect(res).toEqual({ status: "pending" });
    releaseGen(new Uint8Array([1]));
    expect(await held).toMatchObject({ status: "ready" });
  });

  it("isolates unknown-IP clients by cookie: one exhausting its quota does not block another", async () => {
    const d = deps({ ip: "unknown" });
    for (let i = 0; i < 5; i++) {
      const res = await orchestrate({ ...passage, n: 500 + i }, { ...d, anonId: "anon-a" });
      expect(res.status).toBe("ready");
    }
    const blocked = await orchestrate({ ...passage, n: 505 }, { ...d, anonId: "anon-a" });
    expect(blocked).toMatchObject({ status: "error", code: "quota" });
    const other = await orchestrate({ ...passage, n: 506 }, { ...d, anonId: "anon-b" });
    expect(other.status).toBe("ready");
  });

  it("refuses when the cookie counter runs out while IPs stay fresh", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) {
      const res = await orchestrate({ ...passage, n: 400 + i }, { ...d, ip: `10.0.0.${i}` });
      expect(res.status).toBe("ready");
    }
    const res = await orchestrate({ ...passage, n: 405 }, { ...d, ip: "10.9.9.9" });
    expect(res).toMatchObject({ status: "error", code: "quota" });
    expect(await d.kv.get(spendKey())).toBe("50000");
  });

  it("resets quota on UTC day rollover", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) {
      const res = await orchestrate({ ...passage, n: 200 + i }, { ...d, day: "2026-10-27" });
      expect(res.status).toBe("ready");
    }
    const refused = await orchestrate(passage, { ...d, day: "2026-10-27" });
    expect(refused).toMatchObject({ status: "error", code: "quota" });
    const next = await orchestrate({ ...passage, n: 300 }, { ...d, day: "2026-10-28" });
    expect(next.status).toBe("ready");
  });

  it("returns generic text when KV throws after the lock", async () => {
    const d = deps();
    const kv = { ...d.kv, incrBy: async (): Promise<number> => {
      throw new Error("kv-boom-marker");
    } };
    const res = await orchestrate(passage, { ...d, kv });
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(res)).not.toContain("kv-boom-marker");
    expect(await kv.setNxEx(lockKeyFor(imageKey(passage)), "probe", 150)).toBe(true);
  });

  it("returns ready with the URL when the index write fails", async () => {
    const d = deps();
    d.kv.set = async () => {
      throw new Error("index-boom-marker");
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "ready", cached: false });
    expect(JSON.stringify(res)).not.toContain("index-boom-marker");
    expect(await d.kv.setNxEx(lockKeyFor(imageKey(passage)), "probe", 150)).toBe(true);
  });

  it("tracks the daily counter under the daily cap", async () => {
    const d = deps();
    const res = await orchestrate(passage, d);
    expect(res.status).toBe("ready");
    expect(await d.kv.get(spendKey())).toBe("10000");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("10000");
  });

  it("resets the daily cap on a new UTC day", async () => {
    const tiny = { ...env, dailySpendCapMicro: 10_000 };
    const d = deps({ env: tiny });
    expect((await orchestrate(passage, d)).status).toBe("ready");
    const refused = await orchestrate(
      { ...passage, n: 4 },
      { ...d, ip: "9.9.9.9", anonId: "fresh-1" },
    );
    expect(refused).toMatchObject({ status: "error", code: "daily_budget" });
    // A fresh key: the day-27 index entry would serve n=3 from cache.
    const next = await orchestrate({ ...passage, n: 5 }, { ...d, day: "2026-10-28" });
    expect(next.status).toBe("ready");
    expect(await d.kv.get(dailySpendKey("2026-10-28"))).toBe("10000");
  });

  it("still enforces the total cap with the total message", async () => {
    const d = deps({ env: { ...env, spendCapMicro: 1 } });
    const res = await orchestrate(passage, d);
    expect(res).toEqual({ status: "error", code: "budget", message: MSG_CREDITS_OUT });
    expect(await d.kv.get(spendKey())).toBe("0");
  });

  it("leaves both counters alone on a cached hit", async () => {
    const d = deps();
    const first = await orchestrate(passage, d);
    expect(first.status).toBe("ready");
    const second = await orchestrate(passage, d);
    expect(second).toMatchObject({ status: "ready", cached: true });
    expect(await d.kv.get(spendKey())).toBe("10000");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("10000");
  });

  it("recovers from a lost save race through the winner file", async () => {
    const files = new Map<string, Uint8Array>();
    const d = deps();
    d.store = {
      findUrl: async (path) => (files.has(path) ? `https://blob.example/${path}` : null),
      save: async (path, bytes) => {
        files.set(path, bytes);
        throw new Error("race lost");
      },
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "ready", cached: true });
  });
});

describe("orchestrate range reuse", () => {
  it("reuses a cached picture for an overlapping selection", async () => {
    const d = deps();
    let calls = 0;
    d.generate = { generate: async () => (calls++, new Uint8Array([9])) };
    const first = await orchestrate(passage, d);
    expect(first).toMatchObject({ status: "ready", cached: false });
    const second = await orchestrate({ ...passage, endN: 4 }, d);
    expect(second).toEqual({ ...first, cached: true });
    expect(calls).toBe(1);
    expect(await d.kv.get(spendKey())).toBe("10000");
  });

  it("adds a picture cached before range reuse to the list on its next hit", async () => {
    const d = deps();
    await d.kv.set(indexKeyFor(imageKey(passage)), "https://blob.example/old-p3.webp");
    let calls = 0;
    d.generate = { generate: async () => (calls++, new Uint8Array([9])) };
    await orchestrate(passage, d);
    const res = await orchestrate({ ...passage, endN: 4 }, d);
    expect(res).toMatchObject({ status: "ready", cached: true, url: "https://blob.example/old-p3.webp" });
    expect(calls).toBe(0);
  });

  it("reuses at exactly one third overlap, free with the cached url", async () => {
    const d = deps();
    let calls = 0;
    d.generate = { generate: async () => (calls++, new Uint8Array([9])) };
    const first = await orchestrate({ ...passage, n: 9 }, d);
    expect(first).toMatchObject({ status: "ready", cached: false });
    const second = await orchestrate({ ...passage, n: 8, endN: 10 }, d);
    expect(second).toEqual({ ...first, cached: true });
    expect(calls).toBe(1);
    expect(await d.kv.get(spendKey())).toBe("10000");
    expect(await d.kv.get(lockKeyFor(imageKey({ ...passage, n: 8, endN: 10 })))).toBeNull();
  });

  it("generates a new picture for a much larger selection", async () => {
    const d = deps();
    const saved: string[] = [];
    const innerSave = d.store.save.bind(d.store);
    d.store.save = async (path, bytes) => {
      saved.push(path);
      return innerSave(path, bytes);
    };
    await orchestrate(passage, d);
    const res = await orchestrate({ ...passage, endN: 12 }, d);
    expect(res).toMatchObject({ status: "ready", cached: false });
    expect(saved).toContain("images/oz/t/v1/p3-12.webp");
  });

  it("generates for a disjoint range in the same scene", async () => {
    const d = deps();
    await orchestrate(passage, d);
    const res = await orchestrate({ ...passage, n: 5, endN: 6 }, d);
    expect(res).toMatchObject({ status: "ready", cached: false });
  });

  it("does not reuse the same range from another scene", async () => {
    const d = deps();
    await orchestrate(passage, d);
    const res = await orchestrate({ ...passage, endN: 4 }, { ...d, sceneId: "s2" });
    expect(res).toMatchObject({ status: "ready", cached: false });
  });

  it("caps the stored range list", async () => {
    const d = deps();
    for (let i = 0; i < MAX_RANGES_PER_SCENE + 5; i++) {
      const res = await orchestrate(
        { ...passage, n: 100 + i },
        { ...d, ip: `10.1.0.${i}`, anonId: `cap-${i}` },
      );
      expect(res.status).toBe("ready");
    }
    const raw = await d.kv.get(rangeListKeyFor(passage, "s1"));
    expect(parseRanges(raw)).toHaveLength(MAX_RANGES_PER_SCENE);
  });

  it("gives pending to a concurrent identical range request", async () => {
    const d = deps();
    let releaseGen!: (bytes: Uint8Array) => void;
    let genCalled!: () => void;
    const called = new Promise<void>((resolve) => (genCalled = resolve));
    d.generate = {
      generate: () =>
        new Promise<Uint8Array>((resolve) => {
          releaseGen = resolve;
          genCalled();
        }),
    };
    const range = { ...passage, n: 7, endN: 8 };
    const held = orchestrate(range, { ...d, token: "owner" });
    await called;
    const res = await orchestrate(range, { ...d, token: "other" });
    expect(res).toEqual({ status: "pending" });
    releaseGen(new Uint8Array([1]));
    expect(await held).toMatchObject({ status: "ready" });
  });
});

describe("human gate", () => {
  const noFetch = vi.fn(async () => {
    throw new Error("siteverify must not be called");
  });

  function gate(over: Partial<NonNullable<OrchestrateDeps["human"]>> = {}): NonNullable<OrchestrateDeps["human"]> {
    return {
      cookieHeader: null,
      ip: "9.9.9.9",
      sessionSecret: "s",
      turnstileSecret: "ts-secret",
      turnstileSiteKey: "ts-site",
      fetchFn: noFetch as unknown as typeof fetch,
      ...over,
    };
  }

  it("blocks without a cookie or token, taking nothing and freeing the lock", async () => {
    const d = deps({ human: gate() });
    const res = await orchestrate(passage, d);
    expect(res).toEqual({ status: "error", code: "human", message: MSG_HUMAN });
    expect(await d.kv.get(spendKey())).toBeNull();
    expect(await d.kv.get(dailySpendKey(d.day))).toBeNull();
    const keys = quotaKeys({ day: d.day, ipHash: hashIp("9.9.9.9", "salt"), anonId: "anon-1" });
    expect(await d.kv.get(keys.ip)).toBeNull();
    expect(await d.kv.get(keys.anon)).toBeNull();
    // Lock released: a new request generates instead of pending.
    expect(await d.kv.setNxEx(lockKeyFor(imageKey(passage)), "probe", 150)).toBe(true);
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("proceeds with a valid human_ok cookie", async () => {
    const value = issueHumanCookie("s").split(";")[0];
    const d = deps({ human: gate({ cookieHeader: value }) });
    const res = await orchestrate(passage, d);
    expect(res.status).toBe("ready");
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("proceeds with a legacy chat_human cookie", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const sig = createHmac("sha256", "s").update(`chat_human:${expiry}`).digest("hex");
    const d = deps({ human: gate({ cookieHeader: `chat_human=${expiry}.${sig}` }) });
    const res = await orchestrate(passage, d);
    expect(res.status).toBe("ready");
    expect(noFetch).not.toHaveBeenCalled();
  });

  it("proceeds on a valid token and surfaces the issued cookie", async () => {
    const siteFetch = vi.fn(async () => Response.json({ success: true }));
    const humanOut: { setCookie?: string } = {};
    const d = deps({
      human: gate({ token: "tok", fetchFn: siteFetch as unknown as typeof fetch }),
      humanOut,
    });
    const res = await orchestrate(passage, d);
    expect(res.status).toBe("ready");
    expect(siteFetch).toHaveBeenCalledOnce();
    expect(humanOut.setCookie).toMatch(/^human_ok=/);
    expect(humanOut.setCookie).toContain("Path=/api");
  });

  it("does not require a human on a cached hit", async () => {
    const d = deps();
    expect((await orchestrate(passage, d)).status).toBe("ready");
    const hit = await orchestrate(passage, deps({ kv: d.kv, store: d.store, human: gate() }));
    expect(hit).toMatchObject({ status: "ready", cached: true });
    expect(noFetch).not.toHaveBeenCalled();
  });
});
