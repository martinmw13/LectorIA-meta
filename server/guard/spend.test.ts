import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/core/images";
import {
  DAILY_SPEND_TTL_SEC,
  budgetExceeded,
  dailySpendKey,
  reserveSpend,
  spendKey,
} from "./spend";

const CAPS = { spendCapMicro: 10_000, dailySpendCapMicro: 10_000 };



describe("spend keys", () => {
  it("keeps the key strings byte-identical", () => {
    expect(spendKey()).toBe("img:spend:micro");
    expect(dailySpendKey("2026-10-27")).toBe("img:spend:daily:2026-10-27");
    expect(dailySpendKey("2026-10-28")).not.toBe(dailySpendKey("2026-10-27"));
    expect(dailySpendKey("2026-10-28")).not.toBe(spendKey());
    expect(DAILY_SPEND_TTL_SEC).toBe(172800);
  });

  it("flags a spend total over the cap", () => {
    expect(budgetExceeded(11_000_000, 10_000_000)).toBe(true);
    expect(budgetExceeded(10_000_000, 10_000_000)).toBe(false);
  });
});

describe("reserveSpend", () => {
  it("reserves both counters and releases each exactly once", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, { amountMicro: 100, day: "2026-10-27", ...CAPS });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(await kv.get(spendKey())).toBe("100");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBe("100");
    await spent.reservation.release();
    await spent.reservation.release();
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBe("0");
  });

  it("refuses over the total cap with a refund and no daily write", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, {
      amountMicro: 100,
      day: "2026-10-27",
      spendCapMicro: 50,
      dailySpendCapMicro: 10_000,
    });
    expect(spent).toEqual({ ok: false, which: "total" });
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBeNull();
  });

  it("refuses over the daily cap with both counters refunded", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, {
      amountMicro: 100,
      day: "2026-10-27",
      spendCapMicro: 10_000,
      dailySpendCapMicro: 50,
    });
    expect(spent).toEqual({ ok: false, which: "daily" });
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBe("0");
  });

  it("refunds the total and rethrows when the daily reserve fails", async () => {
    const kv = createMemoryKV();
    const realIncrBy = kv.incrBy.bind(kv);
    kv.incrBy = async (key: string, by: number) => {
      if (key === dailySpendKey("2026-10-27")) throw new Error("redis down");
      return realIncrBy(key, by);
    };
    await expect(
      reserveSpend(kv, { amountMicro: 100, day: "2026-10-27", ...CAPS }),
    ).rejects.toThrow("redis down");
    expect(await kv.get(spendKey())).toBe("0");
  });

  it("release never throws when Redis fails", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, { amountMicro: 100, day: "2026-10-27", ...CAPS });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    kv.decrBy = async () => {
      throw new Error("redis down");
    };
    await expect(spent.reservation.release()).resolves.toBeUndefined();
  });

  it("adjust folds the real cost into both counters and skips zero", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, { amountMicro: 100, day: "2026-10-27", ...CAPS });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    await spent.reservation.adjust(0);
    expect(await kv.get(spendKey())).toBe("100");
    await spent.reservation.adjust(25);
    expect(await kv.get(spendKey())).toBe("125");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBe("125");
    await spent.reservation.release();
    expect(await kv.get(spendKey())).toBe("25");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBe("25");
  });

  it("charges a custom daily key while sharing the total", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, {
      amountMicro: 100,
      day: "2026-10-27",
      dailyKey: "upload:spend:daily:2026-10-27",
      ...CAPS,
    });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(await kv.get(spendKey())).toBe("100");
    expect(await kv.get("upload:spend:daily:2026-10-27")).toBe("100");
    expect(await kv.get(dailySpendKey("2026-10-27"))).toBeNull();
    await spent.reservation.release();
    expect(await kv.get(spendKey())).toBe("0");
    expect(await kv.get("upload:spend:daily:2026-10-27")).toBe("0");
  });

  it("adjust never throws when Redis fails", async () => {
    const kv = createMemoryKV();
    const spent = await reserveSpend(kv, { amountMicro: 100, day: "2026-10-27", ...CAPS });
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    kv.incrBy = async () => {
      throw new Error("redis down");
    };
    await expect(spent.reservation.adjust(10)).resolves.toBeUndefined();
  });
});
