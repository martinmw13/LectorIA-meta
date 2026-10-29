import { describe, expect, it } from "vitest";
import {
  MSG_CREDITS_OUT,
  createMemoryKV,
  dailySpendKey,
  imageKey,
  lockKeyFor,
  spendKey,
} from "@/core/images";
import type { ImageGenerator, ImageRequest, ImageStore } from "@/core/images";
import { MAX_RANGES_PER_SCENE, parseRanges, rangeListKeyFor } from "@/core/image-ranges";
import type { ImageEnv } from "./env";
import { orchestrate } from "./orchestrate";
import type { OrchestrateDeps } from "./orchestrate";

const env: ImageEnv = {
  upstashUrl: "https://x",
  upstashToken: "t",
  metaKey: "m",
  sessionSecret: "s",
  ipSalt: "salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 1_500_000,
};

const content = {
  passageText: "Dorothy lived in the midst of the great Kansas prairies.",
  sceneTitle: "Gray Life on the Prairie",
  sceneClip: "Gray prairie and a small house.",
};

const passage: ImageRequest = { kind: "passage", bookId: "oz", textVersion: "t", n: 3 };

function deps(over: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
  const files = new Map<string, Uint8Array>();
  const store: ImageStore = {
    findUrl: async (path) =>
      files.has(path) ? `https://blob.example/${path}` : null,
    save: async (path, bytes) => {
      if (files.has(path)) throw new Error("overwrite");
      files.set(path, bytes);
      return `https://blob.example/${path}`;
    },
  };
  const generate: ImageGenerator = {
    generate: async () => new Uint8Array([1, 2, 3]),
  };
  return {
    kv: createMemoryKV(),
    store,
    generate,
    env,
    content,
    ip: "1.2.3.4",
    anonId: "anon-1",
    day: "2026-10-27",
    sceneId: "s1",
    ...over,
  };
}

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

  it("refuses the 6th image per person and refunds both counters", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) {
      // Distinct keys: repeat taps on one paragraph hit the cache for free.
      const key: ImageRequest = { ...passage, n: 100 + i };
      const res = await orchestrate(key, { ...d, anonId: `fresh-${i}` });
      expect(res.status).toBe("ready");
    }
    const kv = d.kv;
    const before = await kv.get(spendKey());
    const res = await orchestrate(passage, { ...d, anonId: "fresh-5" });
    expect(res).toMatchObject({ status: "error", code: "quota" });
    // Refund keeps counters at 5 so a new day key starts clean logic holds;
    // spend did not move for the refused call.
    expect(await kv.get(spendKey())).toBe(before);
  });

  it("refunds quota and budget on Meta failure with no raw error text", async () => {
    const d = deps();
    d.generate = {
      generate: async () => {
        throw new Error("meta secret internals 500");
      },
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(res)).not.toContain("secret internals");
    expect(await d.kv.get(spendKey())).toBe("0");
    // Lock released: a new request generates instead of pending.
    const retry = await orchestrate(passage, {
      ...d,
      generate: { generate: async () => new Uint8Array([7]) },
    });
    expect(retry.status).toBe("ready");
  });

  it("refuses over the spend cap and refunds the reserve", async () => {
    const d = deps({ env: { ...env, spendCapMicro: 1 } });
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "budget" });
    expect(await d.kv.get(spendKey())).toBe("0");
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

  it("refuses over the daily cap with a refund and no generate call", async () => {
    const d = deps({ env: { ...env, dailySpendCapMicro: 1 } });
    let calls = 0;
    d.generate = {
      generate: async () => (calls++, new Uint8Array([9])),
    };
    const res = await orchestrate(passage, d);
    expect(res).toEqual({ status: "error", code: "daily_budget", message: MSG_CREDITS_OUT });
    expect(calls).toBe(0);
    expect(await d.kv.get(spendKey())).toBe("0");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("0");
    // Lock released: a new request generates instead of pending.
    const retry = await orchestrate(passage, {
      ...d,
      env: { ...env, dailySpendCapMicro: 1_500_000 },
      generate: { generate: async () => new Uint8Array([7]) },
    });
    expect(retry.status).toBe("ready");
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

  it("refunds the daily counter when generation fails", async () => {
    const d = deps();
    d.generate = {
      generate: async () => {
        throw new Error("meta secret internals 500");
      },
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(await d.kv.get(spendKey())).toBe("0");
    expect(await d.kv.get(dailySpendKey("2026-10-27"))).toBe("0");
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

  it("refunds both spend counters exactly once when store.save fails", async () => {
    const d = deps();
    d.store = {
      findUrl: async () => null,
      save: async () => {
        throw new Error("blob down");
      },
    };
    const totalKey = spendKey();
    const dayKey = dailySpendKey(d.day);
    let totalRefunds = 0;
    let dailyRefunds = 0;
    const inner = d.kv.decrBy.bind(d.kv);
    d.kv.decrBy = async (key: string, by: number) => {
      if (key === totalKey) totalRefunds += 1;
      if (key === dayKey) dailyRefunds += 1;
      return inner(key, by);
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(await d.kv.get(totalKey)).toBe("0");
    expect(await d.kv.get(dayKey)).toBe("0");
    expect(totalRefunds).toBe(1);
    expect(dailyRefunds).toBe(1);
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
