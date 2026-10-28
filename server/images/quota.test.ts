import { describe, expect, it } from "vitest";
import { createMemoryKV } from "@/core/images";
import {
  FREE_BOOKS_PER_PERSON,
  bookQuotaKeysFor,
  checkBookQuota,
  refundBookQuota,
} from "./quota";

const SALT = "test-salt";

describe("free book quota", () => {
  it("allows the first book", async () => {
    const kv = createMemoryKV();
    const keys = bookQuotaKeysFor({ ip: "1.2.3.4", salt: SALT, anonId: "anon-1" });
    expect(await checkBookQuota(kv, keys)).toEqual({ ok: true });
  });

  it("blocks a second book on a new cookie from the same IP", async () => {
    const kv = createMemoryKV();
    const first = bookQuotaKeysFor({ ip: "1.2.3.4", salt: SALT, anonId: "anon-1" });
    expect(await checkBookQuota(kv, first)).toEqual({ ok: true });
    const second = bookQuotaKeysFor({ ip: "1.2.3.4", salt: SALT, anonId: "anon-2" });
    expect(await checkBookQuota(kv, second)).toEqual({ ok: false });
  });

  it("blocks a second book on a new IP with the same cookie", async () => {
    const kv = createMemoryKV();
    const first = bookQuotaKeysFor({ ip: "1.2.3.4", salt: SALT, anonId: "anon-1" });
    expect(await checkBookQuota(kv, first)).toEqual({ ok: true });
    const second = bookQuotaKeysFor({ ip: "9.9.9.9", salt: SALT, anonId: "anon-1" });
    expect(await checkBookQuota(kv, second)).toEqual({ ok: false });
  });

  it("allows a retry after a refund", async () => {
    const kv = createMemoryKV();
    const keys = bookQuotaKeysFor({ ip: "1.2.3.4", salt: SALT, anonId: "anon-1" });
    expect(await checkBookQuota(kv, keys)).toEqual({ ok: true });
    await refundBookQuota(kv, keys);
    expect(await checkBookQuota(kv, keys)).toEqual({ ok: true });
  });

  it("caps one free book per person", () => {
    expect(FREE_BOOKS_PER_PERSON).toBe(1);
  });
});
