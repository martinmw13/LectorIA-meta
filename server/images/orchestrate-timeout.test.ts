import { describe, expect, it } from "vitest";
import { MSG_CREDITS_OUT, imageKey, lockKeyFor, quotaKeys } from "@/core/images";
import type { ImageRequest } from "@/core/images";
import { dailySpendKey, spendKey } from "@/server/guard/spend";
import { hashIp } from "@/server/guard/request";
import { orchestrate } from "./orchestrate";
import { deps, env, passage } from "./orchestrate-fixtures";

describe("orchestrate timeouts and refunds", () => {
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

  it("refunds quota and budget and releases the lock when Meta times out", async () => {
    const d = deps();
    d.generate = {
      generate: async () => {
        throw new DOMException("signal timed out", "TimeoutError");
      },
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(res)).not.toContain("timed out");
    expect(await d.kv.get(spendKey())).toBe("0");
    expect(await d.kv.get(dailySpendKey(d.day))).toBe("0");
    const keys = quotaKeys({ day: d.day, ipHash: hashIp("1.2.3.4", "salt"), anonId: "anon-1" });
    expect(await d.kv.get(keys.ip)).toBe("0");
    expect(await d.kv.get(keys.anon)).toBe("0");
    expect(await d.kv.setNxEx(lockKeyFor(imageKey(passage)), "probe", 150)).toBe(true);
  });

  it("refunds quota and budget and releases the lock when Blob save times out", async () => {
    const d = deps();
    d.store = {
      findUrl: async () => null,
      save: async () => {
        throw new DOMException("signal timed out", "TimeoutError");
      },
    };
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "unavailable" });
    expect(JSON.stringify(res)).not.toContain("timed out");
    expect(await d.kv.get(spendKey())).toBe("0");
    expect(await d.kv.get(dailySpendKey(d.day))).toBe("0");
    const keys = quotaKeys({ day: d.day, ipHash: hashIp("1.2.3.4", "salt"), anonId: "anon-1" });
    expect(await d.kv.get(keys.ip)).toBe("0");
    expect(await d.kv.get(keys.anon)).toBe("0");
    expect(await d.kv.setNxEx(lockKeyFor(imageKey(passage)), "probe", 150)).toBe(true);
  });

  it("refuses over the spend cap and refunds the reserve", async () => {
    const d = deps({ env: { ...env, spendCapMicro: 1 } });
    const res = await orchestrate(passage, d);
    expect(res).toMatchObject({ status: "error", code: "budget" });
    expect(await d.kv.get(spendKey())).toBe("0");
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
});
