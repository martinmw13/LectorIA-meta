import { describe, expect, it } from "vitest";
import { createMemoryKV, imageKey, lockKeyFor, spendKey } from "@/core/images";
import type { ImageGenerator, ImageRequest, ImageStore } from "@/core/images";
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
